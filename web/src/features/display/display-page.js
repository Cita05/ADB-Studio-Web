import { button, card, el, icon, kvList, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { pageHeader, requireDevice } from "../../app/page-kit.js";
function findByKey(output, key) {
    for (const raw of output.split("\n")) {
        const line = raw.trim();
        if (line.startsWith(key))
            return line.slice(line.indexOf(":") + 1).trim();
    }
    return "";
}
export function createDisplayPage(ctx) {
    let body = null;
    let physicalSize = "";
    let overrideSize = "";
    let physicalDpi = "";
    let overrideDpi = "";
    let width = "";
    let height = "";
    let dpi = "";
    let loading = false;
    const adb = ctx.adb;
    async function load() {
        if (!adb.connected)
            return;
        loading = true;
        paint();
        try {
            const [sizeResult, densityResult] = await Promise.all([adb.shell("wm size"), adb.shell("wm density")]);
            const sizeText = sizeResult.stdout.trim();
            const densityText = densityResult.stdout.trim();
            physicalSize = findByKey(sizeText, "Physical size") || sizeText;
            overrideSize = findByKey(sizeText, "Override size");
            physicalDpi = findByKey(densityText, "Physical density");
            overrideDpi = findByKey(densityText, "Override density");
            const size = overrideSize || physicalSize;
            if (size.includes("x")) {
                const [w, h] = size.split("x");
                width = w.trim();
                height = h.trim();
            }
            const density = overrideDpi || physicalDpi;
            if (/^\d+$/.test(density))
                dpi = density;
        }
        catch (error) {
            toast(errorText(error), "err");
        }
        finally {
            loading = false;
            paint();
        }
    }
    async function setResolution() {
        if (!width || !height)
            return;
        await adb.runAdbLine(`shell wm size ${width}x${height}`);
        await load();
    }
    async function setDensity() {
        if (!/^\d+$/.test(dpi))
            return;
        await adb.runAdbLine(`shell wm density ${dpi}`);
        await load();
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("Display Settings", "Display", button("Refresh", { icon: "refresh", small: true, disabled: !adb.connected || loading, onClick: () => void load() })));
        const empty = requireDevice(adb, () => ctx.shell.connectUsbDialog());
        if (empty) {
            body.appendChild(empty);
            return;
        }
        const infoCard = card("Current Display Info", loading
            ? el("div", { class: "muted small" }, "Loading…")
            : kvList([
                ["Physical", physicalSize || "—"],
                ["Override Size", overrideSize || physicalSize || "—"],
                ["DPI:", physicalDpi ? `${physicalDpi} dpi` : "—"],
                ["Override DPI", overrideDpi ? `${overrideDpi} dpi` : "Not supported by this device"],
            ]), { icon: "display" });
        const widthInput = el("input", { class: "input", value: width, placeholder: "1080" });
        widthInput.addEventListener("input", () => (width = widthInput.value.trim()));
        const heightInput = el("input", { class: "input", value: height, placeholder: "1920" });
        heightInput.addEventListener("input", () => (height = heightInput.value.trim()));
        const resCard = card("Resolution Settings", el("div", { class: "stack" }, el("div", { class: "row" }, el("div", { class: "field grow" }, el("label", null, "Width:"), widthInput), el("div", { class: "field grow" }, el("label", null, "Height:"), heightInput)), el("div", { class: "row" }, button("Set Resolution", { variant: "primary", small: true, onClick: () => void setResolution() }), button("Reset Resolution", { small: true, onClick: () => void adb.runAdbLine("shell wm size reset").then(load) }))), { icon: "maximize" });
        const dpiInput = el("input", { class: "input", value: dpi, placeholder: "420" });
        dpiInput.addEventListener("input", () => (dpi = dpiInput.value.trim()));
        const dpiCard = card("DPI Settings", el("div", { class: "stack" }, el("div", { class: "field" }, el("label", null, "DPI:"), dpiInput), el("div", { class: "row" }, button("Set DPI", { variant: "primary", small: true, onClick: () => void setDensity() }), button("Reset DPI", { small: true, onClick: () => void adb.runAdbLine("shell wm density reset").then(load) })), el("div", { class: "muted small", style: "line-height:1.7;display:flex;gap:7px;align-items:flex-start" }, icon("info", 14), "Override Settings")), { icon: "cpu" });
        body.append(el("div", { class: "stack" }, infoCard, el("div", { class: "grid two" }, resCard, dpiCard)));
    }
    return {
        id: "display",
        icon: "display",
        label: "Display",
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
