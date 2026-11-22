import { pressKey } from "../services/adb/keys.js";
import { saveBlob } from "../shared/fs.js";
import { el, icon, toast } from "../shared/dom.js";
import { errorText } from "../shared/errors.js";

const KEY_BUTTONS = [
  ["Back", "back", "back"],
  ["Home", "home", "home"],
  ["Recents", "recents", "recents"],
];

/** Persistent bottom bar: hardware keys, floating mirror and screenshot. */
export function createKeybar({ adb, mirror }) {
  const bar = el("footer", { class: "keybar" });

  const render = () => {
    const enabled = adb.connected;
    const keyButton = (label, iconName, onClick, options = {}) => {
      const cls = ["key-btn", options.accent && "accent", options.on && "on"].filter(Boolean).join(" ");
      const node = el(
        "button",
        { class: cls, title: label, disabled: !enabled },
        icon(iconName, 17),
        el("span", null, label),
      );
      node.addEventListener("click", onClick);
      return node;
    };
    const press = async (name, longPress = false) => {
      if (!adb.connected) return;
      try {
        await pressKey(adb, name, longPress);
      } catch (error) {
        toast(errorText(error), "err");
      }
    };
    const screenshot = async () => {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        if (await saveBlob(await adb.screenshotPng(), `screenshot_${stamp}.png`, "PNG image", ".png")) {
          toast("Screenshot saved", "ok");
        }
      } catch (error) {
        toast(errorText(error), "err");
      }
    };

    bar.replaceChildren();
    bar.append(
      el("span", { class: "keybar-label" }, "Key Simulation"),
      ...KEY_BUTTONS.map(([label, iconName, key]) => keyButton(label, iconName, () => void press(key))),
      el("div", { class: "keybar-sep" }),
      keyButton("Vol+", "volup", () => void press("vol_up")),
      keyButton("Vol-", "voldown", () => void press("vol_down")),
      keyButton("Mute", "mute", () => void press("mute")),
      el("div", { class: "keybar-sep" }),
      keyButton("Power", "power", () => void press("power")),
      keyButton("Long Press Power", "power", () => void press("power", true)),
      el("div", { class: "keybar-sep" }),
      keyButton(mirror.active ? "Stop Cast" : "Screen Cast", "monitor", () => mirror.toggle(), {
        accent: true,
        on: mirror.active,
      }),
      keyButton("Screenshot", "camera", () => void screenshot(), { accent: true }),
      el("div", { class: "spacer" }),
      el("span", { class: "muted small" }, adb.info?.key ?? "No device"),
    );
  };

  return { el: bar, render };
}
