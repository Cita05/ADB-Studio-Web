import { button, card, el, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { clamp } from "../../shared/format.js";
import { pageHeader, requireDevice } from "../../app/page-kit.js";
export const SLIDERS = [
    {
        key: "font",
        title: "Font Size",
        min: 0.5,
        max: 2,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}×`,
        load: "settings get system font_scale",
        write: (v) => [`settings put system font_scale ${v.toFixed(2)}`],
    },
    {
        key: "anim",
        title: "Animation Speed",
        min: 0,
        max: 10,
        step: 0.5,
        format: (v) => `${v.toFixed(1)}×`,
        load: "settings get global window_animation_scale",
        write: (v) => ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"].map((key) => `settings put global ${key} ${v.toFixed(1)}`),
    },
    {
        key: "screen_off",
        title: "Screen Off",
        min: 5000,
        max: 300000,
        step: 5000,
        format: (v) => `${Math.round(v / 1000)} s`,
        load: "settings get system screen_off_timeout",
        write: (v) => [`settings put system screen_off_timeout ${Math.round(v)}`],
    },
    {
        key: "brightness",
        title: "Brightness",
        min: 0,
        max: 255,
        step: 1,
        format: (v) => `${Math.round(v)}`,
        load: "settings get system screen_brightness",
        write: (v) => [`settings put system screen_brightness ${Math.round(v)}`],
    },
];
export function createAdjustPage(ctx) {
    let body = null;
    const values = {};
    let loading = false;
    const adb = ctx.adb;
    async function load() {
        if (!adb.connected)
            return;
        loading = true;
        paint();
        try {
            const results = await Promise.all(SLIDERS.map((slider) => adb.shell(slider.load, 8000)));
            SLIDERS.forEach((slider, index) => {
                const raw = results[index].stdout.trim().split("\n").pop() ?? "";
                const parsed = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
                if (Number.isFinite(parsed))
                    values[slider.key] = parsed;
            });
        }
        catch (error) {
            toast(errorText(error), "err");
        }
        finally {
            loading = false;
            paint();
        }
    }
    async function applySlider(slider) {
        const value = values[slider.key];
        if (value == null)
            return;
        for (const command of slider.write(value)) {
            await adb.runAdbLine(`shell ${command}`);
        }
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("System Adjust", "Adjust", button("Refresh", { icon: "refresh", small: true, disabled: !adb.connected || loading, onClick: () => void load() })));
        const empty = requireDevice(adb, () => ctx.shell.connectUsbDialog());
        if (empty) {
            body.appendChild(empty);
            return;
        }
        const cards = SLIDERS.map((slider) => {
            const value = clamp(values[slider.key] ?? slider.min, slider.min, slider.max);
            const range = el("input", {
                type: "range",
                min: String(slider.min),
                max: String(slider.max),
                step: String(slider.step),
                value: String(value),
            });
            const readout = el("div", { class: "slider-value" }, slider.format(value));
            range.addEventListener("input", () => {
                values[slider.key] = Number(range.value);
                readout.textContent = slider.format(Number(range.value));
            });
            range.addEventListener("change", () => {
                values[slider.key] = Number(range.value);
                void applySlider(slider);
            });
            const bodyContent = [
                el("div", { class: "slider-row" }, range, readout),
                el("div", { class: "row", style: "margin-top:8px;justify-content:space-between" }, el("span", { class: "muted small" }, `${slider.min} — ${slider.max}`), el("span", { class: "muted small" }, loading ? "Loading…" : "Ready")),
            ];
            if (slider.key === "brightness") {
                bodyContent.push(el("div", { class: "row", style: "margin-top:10px" }, button("Turn Auto Brightness On", {
                    small: true,
                    onClick: () => void adb.runAdbLine("shell settings put system screen_brightness_mode 1"),
                }), button("Turn Auto Brightness Off", {
                    small: true,
                    onClick: () => void adb.runAdbLine("shell settings put system screen_brightness_mode 0"),
                })));
            }
            return card(slider.title, el("div", { class: "stack" }, ...bodyContent), {
                icon: slider.key === "brightness" ? "sliders" : "settings",
            });
        });
        body.append(...cards);
    }
    return {
        id: "adjust",
        icon: "sliders",
        label: "Adjust",
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
