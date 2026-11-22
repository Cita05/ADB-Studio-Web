import { button, card, el, kvList, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { pageHeader, requireDevice } from "../../app/page-kit.js";
const EMPTY_INFO = {
    brand: "",
    model: "",
    codename: "",
    system: "",
    cpu: "",
    storage: "",
    display: "",
    uptime: "",
    battery: "",
    board: "",
    platform: "",
    build: "",
    kernel: "",
};
const PROPS = {
    brand: "ro.product.brand",
    model: "ro.product.model",
    codename: "ro.product.device",
    cpu: "ro.product.cpu.abi",
    storage: "ro.hardware.egl",
    board: "ro.product.board",
    platform: "ro.board.platform",
    build: "ro.build.fingerprint",
};
function extract(text, key) {
    const line = text.split("\n").map((l) => l.trim()).find((l) => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : "";
}
function lastValue(text) {
    const lines = text.trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    const idx = last.indexOf(":");
    return (idx >= 0 ? last.slice(idx + 1) : last).trim().split(/\s+/)[0] ?? "";
}
async function readInfo(adb) {
    const propEntries = await Promise.all(Object.entries(PROPS).map(async ([key, prop]) => [key, await adb.getProp(prop)]));
    const [android, api, wmSize, wmDensity, battery, uptime, kernel] = await Promise.all([
        adb.getProp("ro.build.version.release"),
        adb.getProp("ro.build.version.sdk"),
        adb.shell("wm size").then((r) => r.stdout),
        adb.shell("wm density").then((r) => r.stdout),
        adb.shell("dumpsys battery").then((r) => r.stdout),
        adb.shell("uptime").then((r) => r.stdout),
        adb.shell("uname -r").then((r) => r.stdout),
    ]);
    const info = { ...EMPTY_INFO };
    for (const [key, value] of propEntries)
        info[key] = value;
    info.system = `Android ${android} (API ${api})`;
    const size = lastValue(wmSize);
    const density = lastValue(wmDensity);
    const sizeMatch = size.match(/(\d+)x(\d+)/);
    info.display = sizeMatch ? `${sizeMatch[1]}×${sizeMatch[2]}${density ? ` (${density}dpi)` : ""}` : size;
    const level = extract(battery, "level");
    if (level) {
        const voltage = extract(battery, "voltage");
        const temp = extract(battery, "temperature");
        info.battery = `${level}%${voltage ? ` · ${voltage} mV` : ""}${temp ? ` · ${(Number(temp) / 10).toFixed(1)}°C` : ""}`;
    }
    info.uptime = uptime.trim();
    info.kernel = kernel.trim();
    return info;
}
const REBOOT_ACTIONS = [
    { label: "Reboot", command: "shell reboot" },
    { label: "Fastboot", command: "reboot bootloader" },
    { label: "EDL", command: "reboot edl" },
    { label: "Shutdown", command: "shell reboot -p" },
    { label: "Recovery", command: "reboot recovery" },
];
export function createHomePage(ctx) {
    let body = null;
    let info = { ...EMPTY_INFO };
    let loading = false;
    let error = "";
    let ip = "";
    async function load() {
        if (!ctx.adb.connected || loading)
            return;
        loading = true;
        error = "";
        paint();
        try {
            info = await readInfo(ctx.adb);
            ip = (await ctx.adb.deviceIp()) ?? "";
        }
        catch (err) {
            error = errorText(err);
        }
        finally {
            loading = false;
            paint();
        }
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("Device Info", ctx.adb.info ? `Device: ${ctx.adb.info.name ?? ctx.adb.info.label}` : "Android Device Manager", button("Refresh", { icon: "refresh", small: true, disabled: !ctx.adb.connected, onClick: () => void load() }), button("Network Debug", { icon: "wifi", small: true, onClick: () => ctx.shell.openWifiDialog() })));
        const empty = requireDevice(ctx.adb, () => ctx.shell.connectUsbDialog());
        if (empty) {
            body.appendChild(empty);
            return;
        }
        const infoRows = [
            ["Brand", info.brand],
            ["Model", info.model],
            ["Codename", info.codename],
            ["System", info.system],
            ["CPU Arch", info.cpu],
            ["Storage Type", info.storage],
            ["Display Info", info.display],
            ["Uptime", info.uptime],
            ["Battery Info", info.battery],
            ["Board ID", info.board],
            ["Platform", info.platform],
            ["Build Fingerprint", info.build],
            ["Kernel Version", info.kernel],
        ];
        const infoCard = card("Device Info", loading
            ? el("div", { class: "stack" }, el("div", { class: "progress" }, el("i", { style: "width:60%;animation:pulse 1s infinite" })), el("div", { class: "muted small" }, "Loading…"))
            : el("div", { class: "grid two", style: "gap:0 26px" }, kvList(infoRows.slice(0, 7)), kvList(infoRows.slice(7))), {
            icon: "phone",
            actions: [button("Disconnect", { variant: "danger", small: true, onClick: () => void ctx.adb.disconnect() })],
        });
        const rebootCard = card("Quick Reboot", el("div", { class: "row" }, ...REBOOT_ACTIONS.map((action) => button(action.label, {
            variant: action.label === "Shutdown" ? "danger" : "ghost",
            small: true,
            onClick: () => void ctx.adb.runAdbLine(action.command),
        }))), { icon: "power", sub: "Quick actions" });
        const wirelessCard = card("Wireless ADB", el("div", { class: "stack" }, el("div", { class: "muted small", style: "line-height:1.7" }, "Switches adbd to TCP mode so the bridge can reach the phone over Wi-Fi."), el("div", { class: "row" }, button("Enable Wi-Fi ADB", {
            icon: "wifi",
            small: true,
            onClick: async () => {
                try {
                    const out = await ctx.adb.enableTcpip(5555);
                    const address = await ctx.adb.deviceIp();
                    if (address)
                        ip = address;
                    toast(out || `Wi-Fi ADB enabled on port ${5555}. Now find the phone IP.`, "ok");
                    paint();
                }
                catch (err) {
                    toast(errorText(err), "err");
                }
            },
        }), button("Connect", { icon: "link", small: true, onClick: () => ctx.shell.openWifiDialog() })), ip ? el("div", { class: "hint" }, `IP: ${ip} · Wi-Fi ADB enabled on port 5555. Now find the phone IP.`) : null, el("div", { class: "muted small" }, "2. Start the bridge on this computer:"), el("code", { class: "small", style: "color:#9dc0ff" }, "node bridge/adb-ws-bridge.mjs --port 7331")), { icon: "wifi" });
        if (error) {
            body.appendChild(el("div", { class: "hint warn", style: "margin-bottom:14px" }, error));
        }
        body.append(infoCard, rebootCard, wirelessCard);
    }
    return {
        id: "home",
        icon: "phone",
        label: "Home",
        section: "device",
        render(root) {
            body = root;
            paint();
            if (ctx.adb.connected)
                void load();
        },
        onShow() {
            if (ctx.adb.connected)
                void load();
        },
    };
}
