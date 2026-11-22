import { button, card, el, kvList, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { pageHeader, requireDevice } from "../../app/page-kit.js";

const STATUS = { 1: "Unknown", 2: "Charging", 3: "Discharging", 4: "Not charging", 5: "Full" };
const HEALTH = { 1: "Unknown", 2: "Good", 3: "Overheat", 4: "Dead", 5: "Over voltage", 6: "Failure", 7: "Cold" };

export function createBatteryPage(ctx) {
    let body = null;
    let values = {};
    let extras = {};
    let levelInput = "";
    let loading = false;
    const adb = ctx.adb;

    async function load() {
        if (!adb.connected)
            return;
        loading = true;
        paint();
        try {
            const { stdout } = await adb.shell("dumpsys battery");
            const parsed = {};
            for (const raw of stdout.split("\n")) {
                const match = raw.trim().match(/^([\w ]+):\s*(.+)$/);
                if (!match)
                    continue;
                const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
                parsed[key] = match[2].trim();
            }
            values = parsed;
            extras = {
                ac_powered: parsed.ac_powered ?? "",
                usb_powered: parsed.usb_powered ?? "",
                present: parsed.present ?? "",
            };
            if (!levelInput)
                levelInput = parsed.level ?? "";
        }
        catch (error) {
            toast(errorText(error), "err");
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
        body.appendChild(pageHeader("Battery Management", "Battery", button("Refresh", { icon: "refresh", small: true, disabled: !adb.connected || loading, onClick: () => void load() })));
        const empty = requireDevice(adb, () => ctx.shell.connectUsbDialog());
        if (empty) {
            body.appendChild(empty);
            return;
        }
        const codeLabel = (map, raw) => raw ? (map[raw] ?? raw) : "—";
        const rows = [
            ["Level", values.level ? `${values.level}%` : "—"],
            ["Status", codeLabel(STATUS, values.status)],
            ["Temp", values.temperature ? `${(Number(values.temperature) / 10).toFixed(1)} °C` : "—"],
            ["Voltage", values.voltage ? `${values.voltage} mV` : "—"],
            ["Health", codeLabel(HEALTH, values.health)],
            ["Tech", values.technology ?? "—"],
            ["Source", `AC ${extras.ac_powered || "—"} · USB ${extras.usb_powered || "—"} · Present ${extras.present || "—"}`],
        ];
        const infoCard = card("Battery Info", loading ? el("div", { class: "muted small" }, "Loading…") : kvList(rows), {
            icon: "battery",
        });
        const level = el("input", { class: "input", value: levelInput, placeholder: "50" });
        level.addEventListener("input", () => (levelInput = level.value.trim()));
        const simCard = card("Battery Simulation", el("div", { class: "stack" }, el("div", { class: "row" }, el("span", { class: "muted small" }, "Level(%):"), el("div", { style: "width:120px" }, level), button("Set Level", {
            variant: "primary",
            small: true,
            onClick: () => {
                if (!levelInput)
                    return;
                void adb.runAdbLine(`shell dumpsys battery set level ${levelInput}`).then(load);
            },
        })), el("div", { class: "row tight" }, button("Simulate AC", { small: true, onClick: () => void adb.runAdbLine("shell dumpsys battery set ac 1").then(load) }), button("Stop AC", { small: true, onClick: () => void adb.runAdbLine("shell dumpsys battery set ac 0").then(load) }), button("Simulate USB", { small: true, onClick: () => void adb.runAdbLine("shell dumpsys battery set usb 1").then(load) }), button("Stop USB", { small: true, onClick: () => void adb.runAdbLine("shell dumpsys battery set usb 0").then(load) }), button("Reset", { small: true, onClick: () => void adb.runAdbLine("shell dumpsys battery reset").then(load) })), el("div", { class: "muted small", style: "line-height:1.7" }, `Temp: ${values.temperature ?? "—"} · Voltage: ${values.voltage ?? "—"}`)), { icon: "power" });
        body.append(infoCard, simCard);
    }

    return {
        id: "battery",
        icon: "battery",
        label: "Battery",
        section: "manage",
        render(root) {
            body = root;
            paint();
            if (adb.connected)
                void load();
        },
        onShow() {
            if (adb.connected && !loading)
                void load();
        },
    };
}
