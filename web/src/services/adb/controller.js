import { Adb, adbDaemonAuthenticate } from "@yume-chan/adb";
import { AdbWebCryptoCredentialManager, TangoIndexedDbStorage } from "@yume-chan/adb-credential-web";
import { withTimeout } from "../../shared/async.js";
import { errorText } from "../../shared/errors.js";
import { fmtClock, stripAnsi } from "../../shared/format.js";
import { connectionFromWebSocket, openWebSocket } from "./bridge.js";
import { iconFromApk } from "./apk-icon.js";
import { bytesToBlob, collect, decode, isPng, packagePaths } from "./streams.js";
import { UsbBusyError, webusb } from "./webusb.js";
let credentials;
function credentialStore() {
    return (credentials ??= new AdbWebCryptoCredentialManager(new TangoIndexedDbStorage(), "adb-studio"));
}
export class AdbController {
    #adb = null;
    #transport = null;
    #current = null;
    #socket = null;
    #logListeners = new Set();
    #connectionListeners = new Set();
    #connecting = false;
    get connected() {
        return this.#adb != null && this.#current != null;
    }
    /** @internal Attach a fake device for the Playwright UI harness. */
    __debugAttach(info) {
        this.#adb = {};
        this.#current = info;
        this.#emitConnection();
    }
    get info() {
        return this.#current;
    }
    /** @internal Underlying @yume-chan/adb instance (scrcpy engine). */
    get raw() {
        return this.#adb;
    }
    get usbSupported() {
        return webusb.supported;
    }
    // --- events ---
    onLog(fn) {
        this.#logListeners.add(fn);
        return () => this.#logListeners.delete(fn);
    }
    onConnectionChange(fn) {
        this.#connectionListeners.add(fn);
        return () => this.#connectionListeners.delete(fn);
    }
    log(text, kind = "info") {
        const entry = { time: fmtClock(), text: stripAnsi(text), kind };
        for (const fn of this.#logListeners)
            fn(entry);
    }
    #emitConnection() {
        for (const fn of this.#connectionListeners)
            fn(this.#current);
    }
    // --- USB -----------------------------------------------------------
    /** Must be called from a user gesture (button click). */
    async requestUsbTarget() {
        if (!webusb.supported) {
            this.log("WebUSB is unavailable. Use Chrome 118+ or Edge, and open the app from chrome-extension://.", "err");
            return null;
        }
        const device = await webusb.request();
        if (!device)
            return null;
        const target = {
            key: device.serial || `usb-${Date.now()}`,
            label: `${device.name || "Android"} · ${device.serial || ""}`.trim(),
            device,
            usb: device.raw,
        };
        return target;
    }
    async connectUsb(target) {
        if (this.#connecting)
            return;
        this.#connecting = true;
        this.log("Connecting…", "info");
        let connection = null;
        try {
            await this.close();
            connection = await webusb.open(target.device);
            this.#installUsbDisconnectWatcher(target.usb);
            const transport = await withTimeout(adbDaemonAuthenticate({
                serial: target.key,
                connection,
                credentialManager: credentialStore(),
                // Show the "allow USB debugging" dialog rather than hanging silently.
                initialDelayedAckBytes: 0,
            }), 120_000, "The phone did not authorise this browser in time. Unlock it and accept the USB debugging prompt, then try again.");
            this.#attach(new Adb(transport), transport, {
                key: target.key,
                name: target.device?.name || target.label.split(" · ")[0] || "Android",
                label: target.label || target.key,
                kind: "usb",
            });
            this.log("Connected over USB", "ok");
        }
        catch (error) {
            // A failed attempt must not keep the interface claimed: otherwise
            // the next retry would wrongly report "device busy".
            try {
                await connection?.writable?.close?.();
            }
            catch { /* already closed */ }
            try {
                await target.usb.close();
            }
            catch { /* unplugged */ }
            const busy = error?.name === "UsbBusyError" || error instanceof UsbBusyError;
            this.log(busy ? "The USB interface is held by another program (usually the adb server)." : `Connection failed: ${errorText(error)}`, "err");
            throw error;
        }
        finally {
            this.#connecting = false;
        }
    }
    #installUsbDisconnectWatcher(device) {
        const onDisconnect = (event) => {
            if (event.device === device && this.#current?.kind === "usb") {
                void this.#handleDisconnect();
            }
        };
        navigator.usb.addEventListener("disconnect", onDisconnect, { once: true });
    }
    // --- Wi-Fi via local bridge ---
    async connectWifi(host, port, bridgePort) {
        if (this.#connecting)
            return;
        this.#connecting = true;
        const serial = `${host}:${port}`;
        this.log("Connecting…", "info");
        try {
            await this.close();
            const url = `ws://127.0.0.1:${bridgePort}/?host=${encodeURIComponent(host)}&port=${port}`;
            const ws = await openWebSocket(url, 6000);
            this.#socket = ws;
            const connection = connectionFromWebSocket(ws);
            const transport = await withTimeout(adbDaemonAuthenticate({
                serial,
                connection,
                credentialManager: credentialStore(),
            }), 25_000, "The phone did not authorise this browser in time. Unlock it and accept the USB debugging prompt, then try again.");
            this.#attach(new Adb(transport), transport, {
                key: serial,
                name: host,
                label: `${host}:${port}`,
                kind: "wifi",
            });
            this.log("Connected over Wi-Fi", "ok");
            const current = this.#current;
            void this.getProp("ro.product.model").then((model) => {
                if (model && this.#current === current) {
                    this.#current = { ...current, name: model };
                    this.#emitConnection();
                }
            });
        }
        catch (error) {
            this.log(`Connection failed: ${errorText(error)}`, "err");
            throw error;
        }
        finally {
            this.#connecting = false;
        }
    }
    #attach(adb, transport, info) {
        this.#adb = adb;
        this.#transport = transport;
        this.#current = info;
        void transport.disconnected.then(() => {
            if (this.#transport === transport)
                void this.#handleDisconnect();
        });
        this.#emitConnection();
    }
    #clearState() {
        const transport = this.#transport;
        this.#adb = null;
        this.#transport = null;
        this.#current = null;
        this.#socket?.close();
        this.#socket = null;
        return transport;
    }
    async #handleDisconnect() {
        this.#clearState();
        this.log("Disconnected", "warn");
        this.#emitConnection();
    }
    async close() {
        const transport = this.#clearState();
        if (transport) {
            try {
                await transport.close();
            }
            catch {
                /* ignore */
            }
        }
        this.#emitConnection();
    }
    async disconnect() {
        await this.close();
    }
    // --- shell / exec ---
    #requireAdb() {
        if (!this.#adb)
            throw new Error("Connect a device first");
        return this.#adb;
    }
    /** The only place that formats a command for the ADB terminal. */
    #logCommand(command) {
        this.log(`$ ${command}`, "cmd");
    }
    /**
     * Single command gateway: logs every ADB command and executes it.
     *
     * `binary` returns raw stdout bytes (screencap, APK reads); otherwise the
     * result is `{ stdout, stderr, code }` and text output is mirrored to the
     * terminal. `shell`/`execOut` are thin wrappers so feature code never
     * spawns a command without going through this log.
     */
    async runCommand(command, { timeoutMs = 30_000, binary = false, maxBytes = 40 * 1024 * 1024 } = {}) {
        const adb = this.#requireAdb();
        this.#logCommand(command);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
        try {
            const shellService = adb.subprocess.shellProtocol;
            if (shellService) {
                const process = await shellService.spawn([command], controller.signal);
                if (binary) {
                    const [outBytes] = await Promise.all([collect(process.stdout, maxBytes), process.exited]);
                    return outBytes;
                }
                const [outBytes, errBytes] = await Promise.all([collect(process.stdout), collect(process.stderr)]);
                const code = await process.exited;
                const stdout = decode(outBytes);
                const stderr = decode(errBytes);
                this.#logResult(stdout, stderr);
                return { stdout, stderr, code };
            }
            const process = await adb.subprocess.noneProtocol.spawn([command], controller.signal);
            if (binary) {
                const bytes = await collect(process.output, maxBytes);
                await process.exited;
                return bytes;
            }
            const outBytes = await collect(process.output);
            await process.exited;
            const stdout = decode(outBytes);
            this.#logResult(stdout, "");
            return { stdout, stderr: "", code: 0 };
        }
        catch (error) {
            if (binary)
                throw error;
            if (controller.signal.aborted) {
                this.log("[timeout] command took too long", "err");
                return { stdout: "", stderr: "timeout", code: -1 };
            }
            this.log(errorText(error), "err");
            return { stdout: "", stderr: errorText(error), code: -1 };
        }
        finally {
            window.clearTimeout(timer);
        }
    }
    /** Text shell command (logged by runCommand). */
    async shell(command, timeoutMs = 30_000) {
        return this.runCommand(command, { timeoutMs });
    }
    #logResult(stdout, stderr) {
        const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        if (text)
            this.log(text, stderr && !stdout ? "err" : "info");
    }
    /** Binary-safe command output (screencap, cat, …). */
    async execOut(command, timeoutMs = 30_000) {
        return this.runCommand(command, { timeoutMs, binary: true });
    }
    // --- files ---
    async pushBlob(blob, remotePath, onProgress) {
        const adb = this.#requireAdb();
        this.#logCommand(`sync push ${remotePath} (${blob.size} bytes)`);
        const total = blob.size;
        let sent = 0;
        const counted = blob.stream().pipeThrough(new TransformStream({
            transform(chunk, controller) {
                sent += chunk.byteLength;
                onProgress?.(sent, total);
                controller.enqueue(chunk);
            },
        }));
        const sync = adb.sync;
        await sync.write({
            path: remotePath,
            readable: counted,
            mtime: Math.floor(Date.now() / 1000),
        });
    }
    async pullFile(remotePath, onProgress) {
        const adb = this.#requireAdb();
        this.#logCommand(`sync pull ${remotePath}`);
        const reader = adb.sync.read(remotePath).getReader();
        const chunks = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            chunks.push(value);
            total += value.byteLength;
            onProgress?.(total);
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return out;
    }
    /** Best-effort launcher icon (data URL), or null for adaptive-only APKs. */
    async appIconDataUrl(pkg) {
        return iconFromApk(this, pkg).catch(() => null);
    }
    // --- device features ---
    async getProp(key) {
        return this.shell(`getprop ${key}`, 8000).then(({ stdout }) => stdout.trim(), () => "");
    }
    async listPackages(filter = "") {
        const cmd = filter ? `pm list packages ${filter}` : "pm list packages";
        const { stdout } = await this.shell(cmd, 40_000);
        return packagePaths(stdout).sort();
    }
    async foregroundPackage() {
        const { stdout } = await this.shell("dumpsys activity activities", 15_000);
        for (const raw of stdout.split("\n")) {
            const line = raw.trim();
            if (!/mResumedActivity|mFocusedApp|mFocusedWindow/.test(line))
                continue;
            const brace = line.indexOf("{");
            if (brace >= 0 && line.includes("}")) {
                const inner = line.slice(brace + 1, line.indexOf("}"));
                for (const token of inner.split(/\s+/)) {
                    if (token.includes("/") && token.includes(".")) {
                        const pkg = token.split("/")[0].trim();
                        if (pkg)
                            return pkg;
                    }
                }
            }
            const idx = line.indexOf("package:");
            if (idx >= 0) {
                const pkg = line.slice(idx + 8).trim().split(/\s+/)[0];
                if (pkg)
                    return pkg;
            }
        }
        return null;
    }
    async screenshotPng() {
        try {
            const bytes = await this.execOut("screencap -p", 30_000);
            if (isPng(bytes))
                return bytesToBlob(bytes, "image/png");
        }
        catch {
            /* fall back to pull */
        }
        const remote = `/sdcard/.adbstudio_shot_${Date.now()}.png`;
        await this.shell(`screencap -p ${remote}`, 30_000);
        try {
            const bytes = await this.pullFile(remote);
            return bytesToBlob(bytes, "image/png");
        }
        finally {
            void this.shell(`rm -f ${remote}`, 8000);
        }
    }
    /** Physical/override display size in pixels, or null. */
    async screenSize() {
        try {
            const { stdout } = await this.shell("wm size", 8000);
            const match = /Override size:\s*(\d+)x(\d+)/.exec(stdout) ?? /Physical size:\s*(\d+)x(\d+)/.exec(stdout);
            return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Start a long-running shell command and stream its stdout bytes as they
     * arrive (used by the H.264 screen recorder).
     * @param {string} command
     * @param {{ onData?: (chunk: Uint8Array) => void, onStderr?: (chunk: Uint8Array) => void,
     *           onExit?: (code?: number) => void }} handlers
     */
    async streamShell(command, { onData, onStderr, onExit } = {}) {
        const adb = this.#requireAdb();
        this.#logCommand(command);
        const controller = new AbortController();
        const spawner = adb.subprocess.shellProtocol ?? adb.subprocess.noneProtocol;
        const process = await spawner.spawn([command], controller.signal);
        const stdout = process.stdout ?? process.output;
        const stderr = process.stderr;

        const pump = async (stream, forward) => {
            if (!stream) return;
            const reader = stream.getReader();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value?.byteLength) forward?.(value);
                }
            } catch {
                /* aborted */
            }
        };
        void pump(stdout, onData);
        void pump(stderr, onStderr);
        Promise.resolve(process.exited).then(
            (code) => onExit?.(typeof code === "number" ? code : undefined),
            () => onExit?.(undefined),
        );

        return {
            stop() {
                try {
                    controller.abort();
                } catch {
                    /* ignore */
                }
                try {
                    process.kill?.();
                } catch {
                    /* ignore */
                }
            },
        };
    }
    async deviceIp() {
        for (const cmd of ["ip -f inet addr show wlan0", "ip route get 8.8.8.8", "ifconfig wlan0"]) {
            const { stdout } = await this.shell(cmd, 8000);
            const match = /inet\s+(?:addr:)?(\d+\.\d+\.\d+\.\d+)/.exec(stdout) ?? /\bsrc\s+(\d+\.\d+\.\d+\.\d+)/.exec(stdout);
            if (match)
                return match[1];
        }
        return null;
    }
    async enableTcpip(port = 5555) {
        const adb = this.#requireAdb();
        this.#logCommand(`tcpip ${port}`);
        return adb.tcpip.setPort(port);
    }
    async installApk(file, reinstall = true, onProgress) {
        const remote = `/data/local/tmp/adbstudio_${Date.now()}.apk`;
        this.log(`Installing ${file.name}…`, "info");
        await this.pushBlob(file, remote, onProgress);
        try {
            const { stdout, stderr, code } = await this.shell(`pm install ${reinstall ? "-r " : ""}"${remote}"`, 180_000);
            const text = `${stdout}\n${stderr}`.trim();
            if (/Success/i.test(text) || code === 0) {
                this.log("Installed", "ok");
                return true;
            }
            this.log(`Install failed: ${text || `exit ${code}`}`, "err");
            return false;
        }
        finally {
            void this.shell(`rm -f "${remote}"`, 8000);
        }
    }
    // --- adb-style command dispatcher (terminal / scripts / agent) ---
    async runAdbLine(line) {
        const trimmed = line.trim();
        if (!trimmed)
            return { stdout: "", stderr: "", code: 0 };
        if (!this.connected) {
            this.log("Connect a device first", "err");
            return { stdout: "", stderr: "no device", code: -1 };
        }
        const withoutPrefix = trimmed.replace(/^adb\s+/i, "");
        const spaceIndex = withoutPrefix.search(/\s/);
        const head = (spaceIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIndex)).toLowerCase();
        const rest = spaceIndex === -1 ? "" : withoutPrefix.slice(spaceIndex + 1).trim();
        switch (head) {
            case "shell":
                return this.shell(rest);
            case "exec-out":
                try {
                    const bytes = await this.execOut(rest);
                    const text = decode(bytes);
                    this.log(text || `(binary output, ${bytes.byteLength} bytes)`, "info");
                    return { stdout: text, stderr: "", code: 0 };
                }
                catch (error) {
                    return { stdout: "", stderr: errorText(error), code: -1 };
                }
            case "devices":
                this.log(this.#current ? `${this.#current.key}\tdevice` : "No device found", "info");
                return { stdout: this.#current?.key ?? "", stderr: "", code: 0 };
            case "disconnect":
                await this.disconnect();
                return { stdout: "", stderr: "", code: 0 };
            case "tcpip":
                try {
                    const message = await this.enableTcpip(Number(rest) || 5555);
                    this.log(message, "ok");
                    return { stdout: message, stderr: "", code: 0 };
                }
                catch (error) {
                    return { stdout: "", stderr: errorText(error), code: -1 };
                }
            case "reboot":
                this.#logCommand(`reboot${rest ? ` ${rest}` : ""}`);
                try {
                    const message = rest ? await this.#requireAdb().power.reboot(rest) : await this.#requireAdb().power.reboot();
                    this.log(message || "rebooting", "ok");
                    return { stdout: message, stderr: "", code: 0 };
                }
                catch (error) {
                    return { stdout: "", stderr: errorText(error), code: -1 };
                }
            case "install":
                this.log("Use the Software page (or the agent's adb tool) to install a local APK.", "warn");
                return { stdout: "", stderr: "unsupported", code: -1 };
            case "uninstall":
                return this.shell(`pm uninstall ${rest}`, 60_000);
            case "push":
                this.log("push needs a local file; use the Software page instead.", "warn");
                return { stdout: "", stderr: "unsupported", code: -1 };
            case "pull":
                this.log("pull needs a local path; use Export APK / Save screenshot instead.", "warn");
                return { stdout: "", stderr: "unsupported", code: -1 };
            default:
                // Anything else is treated as a shell command, so `input keyevent 3`
                // typed in the terminal works without the `shell` prefix.
                return this.shell(withoutPrefix);
        }
    }
    // --- agent helper: plain text result of a command ---
    async agentAdb(command) {
        const raw = command.trim().replace(/^adb\s+/i, "");
        const line = /^shell\s+/i.test(raw) ? raw : `shell ${raw}`;
        const result = await this.runAdbLine(line);
        const text = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
        return text || "(empty output)";
    }
}
