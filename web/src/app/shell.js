import { errorText } from "../shared/errors.js";
import { createConsoleDock } from "./console-dock.js";
import { createKeybar } from "./keybar.js";
import { button, confirmDialog, copyText, el, icon, modal, toast } from "../shared/dom.js";
import { settings } from "../core/settings.js";
import { createAdjustPage } from "../features/adjust/adjust-page.js";
import { createAgentPage } from "../features/agent/agent-page.js";
import { createBatteryPage } from "../features/battery/battery-page.js";
import { createDisplayPage } from "../features/display/display-page.js";
import { createHomePage } from "../features/home/home-page.js";
import { createMirrorService } from "../features/mirror/mirror-service.js";
import { createScriptPage } from "../features/scripts/scripts-page.js";
import { createSoftwarePage } from "../features/apps/apps-page.js";
const PAGE_DEFS = [
    { id: "home", icon: "phone", label: "Home", section: "device", factory: createHomePage },
    { id: "software", icon: "apps", label: "Software", section: "manage", factory: createSoftwarePage },
    { id: "display", icon: "display", label: "Display", section: "manage", factory: createDisplayPage },
    { id: "battery", icon: "battery", label: "Battery", section: "manage", factory: createBatteryPage },
    { id: "adjust", icon: "sliders", label: "Adjust", section: "manage", factory: createAdjustPage },
    { id: "script", icon: "script", label: "Scripts", section: "tools", factory: createScriptPage },
    { id: "agent", icon: "bot", label: "Agent", section: "tools", factory: createAgentPage },
];
const SECTION_LABEL = {
    device: "Device",
    manage: "Manage",
    tools: "Tools",
};
const WIFI_HINT = "Wi-Fi ADB enabled on port 5555. Now find the phone IP.";
export class AppShell {
    adb;
    app;
    header;
    sidebar;
    pageHost;
    consoleView;
    keybarView;
    pageInstances = new Map();
    active = "home";
    constructor(app, adb) {
        this.app = app;
        this.adb = adb;
        this.consoleView = createConsoleDock({ adb, onChange: () => this.renderHeader() });
        this.mirror = createMirrorService({ adb, toast, onStateChange: () => this.keybarView.render() });
        this.keybarView = createKeybar({ adb, mirror: this.mirror });
    }
    get context() {
        return {
            adb: this.adb,
            shell: {
                navigate: (id) => this.navigate(id),
                rerenderActive: () => this.rebuildActive(),
                openWifiDialog: () => this.openWifiDialog(),
                connectUsbDialog: () => void this.connectUsbDialog(),
                currentPage: () => this.active,
            },
        };
    }
    // --- boot ---
    async start() {
        this.buildChrome();
        this.adb.onConnectionChange(() => this.onConnectionChanged());
        this.navigate("home");
        this.renderHeader();
    }
    buildChrome() {
        this.app.replaceChildren();
        this.header = el("header", { class: "topbar" });
        this.sidebar = el("aside", { class: "sidebar" });
        this.pageHost = el("main", { class: "page-host" });
        const workspace = el("div", { class: "workspace" }, this.pageHost, this.consoleView.el);
        const shell = el("div", { class: "shell" }, this.header, this.sidebar, workspace, this.keybarView.el);
        this.app.appendChild(shell);
        this.renderHeader();
        this.renderNav();
        this.consoleView.render();
        this.keybarView.render();
    }
    // --- header ---
    renderHeader() {
        const info = this.adb.info;
        const connectBtn = button("Connect USB", {
            icon: "usb",
            onClick: () => void this.connectUsbDialog(),
        });
        const wifiBtn = button("Wi-Fi", {
            icon: "wifi",
            onClick: () => this.openWifiDialog(),
        });
        if (info?.kind === "usb")
            connectBtn.classList.add("live");
        if (info?.kind === "wifi")
            wifiBtn.classList.add("live");
        const consoleBtn = button("", {
            icon: "terminal",
            title: "Console",
            onClick: () => this.consoleView.toggle(),
        });
        consoleBtn.classList.add("icon");
        if (this.consoleView.unread > 0)
            consoleBtn.appendChild(el("i", { class: "unread-dot" }));
        const guideBtn = button("", { icon: "info", title: "Guide", onClick: () => this.openGuide() });
        guideBtn.classList.add("icon");
        const disconnectBtn = info
            ? button("Disconnect", { variant: "danger", small: true, onClick: () => void this.adb.disconnect() })
            : null;
        this.header.replaceChildren();
        this.header.append(el("div", { class: "brand" }, el("div", { class: "brand-mark" }, el("img", { src: "./icons/icon48.png", alt: "ADB Studio", width: "46", height: "46", draggable: "false" })), el("div", { class: "brand-name" }, "ADB", el("span", null, " Studio"))), el("div", { class: "device-cluster" }, info?.name ? el("span", { class: "device-name", title: info.name }, info.name) : null, connectBtn, wifiBtn), el("div", { class: "spacer" }), disconnectBtn ?? el("span"), consoleBtn, guideBtn);
    }
    // --- sidebar ---
    renderNav() {
        this.sidebar.replaceChildren();
        let lastSection = null;
        for (const def of PAGE_DEFS) {
            if (def.section !== lastSection) {
                this.sidebar.appendChild(el("div", { class: "nav-group-label" }, SECTION_LABEL[def.section]));
                lastSection = def.section;
            }
            const item = el("button", { class: `nav-item${def.id === this.active ? " active" : ""}`, "data-page": def.id }, icon(def.icon, 18), el("span", null, def.label), def.id === "agent" ? el("span", { class: "badge" }, "AI") : null);
            item.addEventListener("click", () => this.navigate(def.id));
            this.sidebar.appendChild(item);
        }
    }
    // --- pages ---
    navigate(pageId) {
        if (!PAGE_DEFS.some((def) => def.id === pageId))
            return;
        if (this.active !== pageId) {
            this.pageInstances.get(this.active)?.page.onHide?.();
        }
        this.active = pageId;
        this.pageHost.scrollTop = 0;
        for (const item of this.sidebar.querySelectorAll(".nav-item")) {
            item.classList.toggle("active", item.dataset.page === pageId);
        }
        for (const [id, entry] of this.pageInstances) {
            entry.host.style.display = id === pageId ? "" : "none";
        }
        const entry = this.ensurePage(pageId);
        entry.host.style.display = "";
        entry.page.onShow?.();
    }
    ensurePage(pageId) {
        let entry = this.pageInstances.get(pageId);
        if (entry)
            return entry;
        const def = PAGE_DEFS.find((d) => d.id === pageId);
        const host = el("div", { class: `page page-${pageId}` });
        const page = def.factory(this.context);
        host.appendChild(el("div", { class: "page-body" }));
        this.pageHost.appendChild(host);
        entry = { host, page, rendered: false };
        this.pageInstances.set(pageId, entry);
        this.renderPage(entry);
        return entry;
    }
    renderPage(entry) {
        const body = entry.host.firstElementChild;
        body.replaceChildren();
        try {
            entry.page.render(body);
            entry.rendered = true;
        }
        catch (error) {
            body.appendChild(el("div", { class: "hint warn" }, errorText(error)));
        }
    }
    rebuildActive() {
        const entry = this.pageInstances.get(this.active);
        if (!entry)
            return;
        this.renderPage(entry);
    }
    // --- connection ---
    onConnectionChanged() {
        this.renderHeader();
        this.keybarView.render();
        this.navigate(this.active);
        this.rebuildActive();
    }
    async connectUsbDialog() {
        if (!this.adb.usbSupported) {
            toast("WebUSB is unavailable. Use Chrome 118+ or Edge, and open the app from chrome-extension://.", "err", 7000);
            return;
        }
        try {
            const target = await this.adb.requestUsbTarget();
            if (!target)
                return;
            toast("If a dialog appears on the phone, tap “Allow” to authorise this browser.", "info", 7000);
            await this.connectUsb(target);
        }
        catch (error) {
            if (["NotFoundError", "AbortError"].includes(error?.name))
                return;
            toast(`Connection failed: ${errorText(error)}`, "err", 7000);
        }
    }
    async connectUsb(target) {
        try {
            await this.adb.connectUsb(target);
            toast(`Connected over USB: ${target.device?.name || target.label.split(" · ")[0]}`, "ok");
            this.navigate("home");
        }
        catch (error) {
            if (error?.name === "UsbBusyError") {
                this.openUsbBusyDialog(() => void this.connectUsb(target));
                return;
            }
            toast(`Connection failed: ${errorText(error)}`, "err", 8000);
        }
    }
    /**
     * USB interfaces are exclusive: a local adb server (adb.exe), Android
     * Studio, scrcpy or an emulator can hold the ADB interface and Chrome then
     * cannot claim it. Explain the fix instead of a dead-end toast.
     */
    openUsbBusyDialog(retry) {
        const command = "adb kill-server";
        let dialog;
        const copyBtn = button("Copy", {
            icon: "copy",
            small: true,
            onClick: async () => {
                if (await copyText(command))
                    toast("Copied to clipboard", "ok", 1600);
            },
        });
        const closeBtn = button("Close", { small: true, onClick: () => dialog.close() });
        const retryBtn = button("Retry", {
            variant: "primary",
            icon: "refresh",
            small: true,
            onClick: () => {
                dialog.close();
                retry();
            },
        });
        dialog = modal({
            title: "USB interface is busy",
            body: el("div", { class: "stack" },
                el("p", { style: "margin:0;line-height:1.75;color:var(--text-2)" }, "Chrome needs exclusive access to the phone's ADB USB interface. Another program is holding it right now."),
                el("div", { class: "hint" },
                    el("div", null, "1. Stop the local adb server — this is the most common cause:"),
                    el("div", { class: "row", style: "margin-top:8px" },
                        el("code", { style: "flex:1" }, command),
                        copyBtn),
                    el("div", { style: "margin-top:10px" }, "2. Close Android Studio, scrcpy, phone assistants and Android emulators that use this device."),
                    el("div", { style: "margin-top:6px" }, "3. Unplug/replug the cable (or toggle USB debugging), then press Retry.")),
                el("div", { class: "muted small" }, "adb.exe may come from platform-tools, Android Studio or a phone assistant. Closing the program that launched it works too.")),
            footer: [closeBtn, retryBtn],
        });
    }
    // --- wifi dialog ---
    openWifiDialog() {
        const saved = settings.get();
        const bridgeCmd = `node bridge/adb-ws-bridge.mjs --port ${saved.bridgePort}`;
        const hostInput = el("input", { class: "input", value: saved.wifiHost, placeholder: "192.168.1.23" });
        const portInput = el("input", { class: "input", value: String(saved.wifiPort), placeholder: "5555" });
        const bridgeInput = el("input", { class: "input", value: String(saved.bridgePort), placeholder: "7331" });
        const status = el("div", { class: "hint", style: "display:none" });
        const tcpipBtn = button("Enable Wi-Fi ADB", {
            icon: "wifi",
            small: true,
            onClick: async () => {
                if (!this.adb.connected) {
                    toast("Connect a device first", "warn");
                    return;
                }
                try {
                    const output = await this.adb.enableTcpip(5555);
                    const ip = await this.adb.deviceIp();
                    if (ip)
                        hostInput.value = ip;
                    status.style.display = "";
                    status.textContent = `${WIFI_HINT}${ip ? ` · ${ip}` : ""}`;
                    toast(output || WIFI_HINT, "ok");
                }
                catch (error) {
                    toast(errorText(error), "err");
                }
            },
        });
        const connectBtn = button("Connect", { variant: "primary" });
        const dialog = modal({
            title: "Wi-Fi debugging",
            wide: true,
            body: el("div", { class: "stack" }, el("p", { class: "muted", style: "margin:0" }, "Browsers cannot open raw TCP sockets, so a tiny local bridge relays one TCP connection over WebSocket."), el("div", { class: "hint" }, el("div", null, "1. Enable wireless ADB on the phone: USB connect first, then press “Enable Wi-Fi ADB” below, or run adb tcpip 5555."), el("div", { style: "margin-top:8px" }, "2. Start the bridge on this computer:", el("div", { class: "row", style: "margin-top:6px" }, el("code", { style: "flex:1" }, bridgeCmd), button("", {
                icon: "copy",
                small: true,
                title: "Copy",
                onClick: async () => {
                    if (await copyText(bridgeCmd))
                        toast("Copied to clipboard", "ok", 1600);
                },
            }))), el("div", { style: "margin-top:8px" }, "3. Enter the phone IP shown in Settings → Wireless debugging, then connect.")), el("div", { class: "grid", style: "grid-template-columns:1.4fr .8fr .8fr" }, el("div", { class: "field" }, el("label", null, "Phone IP"), hostInput), el("div", { class: "field" }, el("label", null, "Port"), portInput), el("div", { class: "field" }, el("label", null, "Bridge port"), bridgeInput)), el("div", { class: "row" }, tcpipBtn, el("span", { class: "muted small" }, "Bridge not running? See step 2.")), status),
            footer: [connectBtn],
        });
        connectBtn.addEventListener("click", async () => {
            const host = hostInput.value.trim();
            const port = Number(portInput.value.trim()) || 5555;
            const bridgePort = Number(bridgeInput.value.trim()) || 7331;
            if (!host) {
                toast("IP and port cannot be empty", "warn");
                return;
            }
            settings.patch({ wifiHost: host, wifiPort: port, bridgePort });
            connectBtn.disabled = true;
            try {
                await this.adb.connectWifi(host, port, bridgePort);
                toast(`Connected over Wi-Fi: ${host}:${port}`, "ok");
                dialog.close();
                this.navigate("home");
            }
            catch (error) {
                toast(`Connection failed: ${errorText(error)}`, "err", 8000);
            }
            finally {
                connectBtn.disabled = false;
            }
        });
    }
    // --- guide ---
    openGuide() {
        const sections = [
            ["1 · USB (WebUSB)", "A USB interface is exclusive. First run adb kill-server and close Android Studio / scrcpy / emulators that hold the phone, then enable USB debugging, plug the cable, press “Connect USB” and allow the RSA prompt on the phone. Chrome 118+ required."],
            ["2 · Wi-Fi (bridge)", "Run the bundled bridge: node bridge/adb-ws-bridge.mjs --port 7331, enable adb tcpip 5555 (the Home page can do it over USB), then connect to <phone-ip>:5555."],
            ["3 · Scripts", "Scripts are stored in this browser profile. Use the palette to insert command templates, or open a floating screenshot to pick coordinates."],
            ["4 · Agent", "Configure an OpenAI-compatible API (URL, key, model). Craft can call two primitive tools (adb and screen); Ask is a plain streaming conversation."],
            ["5 · Screen mirror", "Open Screen Cast from the bottom bar. The phone display turns off but stays awake. In the floating window: wheel = precise scroll, left = tap (hold then move to long-press drag), middle = recents, right = long press, mouse back/forward = Back/Home. Keyboard defaults to keys mode: Space/←/→ control media, letters/WASD and shortcuts go to Android. Press F2 to enter text/IME mode; type and press Enter to send, then it returns to keys mode. Closing the window stops the mirror and restores the display."],
            ["Privacy", "The API key and chat history stay in this browser profile (localStorage / IndexedDB). Nothing is uploaded except the requests sent to the API you configure."],
        ];
        modal({
            title: "ADB Studio guide",
            wide: true,
            body: el("div", { class: "stack" }, el("p", { style: "margin:0;line-height:1.75" }, "ADB Studio runs entirely in your browser. It talks to the phone's adbd over WebUSB (cable) or through a small WebSocket bridge (Wi-Fi). No local adb.exe is required."), ...sections.map(([title, body]) => el("div", { class: "card", style: "box-shadow:none" }, el("div", { class: "card-head" }, el("div", { class: "card-title" }, title)), el("div", { class: "card-body", style: "padding-top:12px;line-height:1.75;color:var(--text-2);font-size:12.5px" }, body)))),
        });
    }
    // --- convenience ---
    async confirm(message) {
        return confirmDialog(message);
    }
}

