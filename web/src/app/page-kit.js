import { button, card, el, emptyState, icon } from "../shared/dom.js";
export function pageHeader(title, desc, ...actions) {
    return el("div", { class: "page-head" }, el("div", { class: "grow" }, el("h1", null, title), desc ? el("p", null, desc) : null), ...actions.filter(Boolean));
}
/** Returns an empty state node when no device is connected. */
export function requireDevice(adb, onConnect) {
    if (adb.connected)
        return null;
    return card("Device", emptyState("Connect a device first", "A USB interface is exclusive. First run adb kill-server and close Android Studio / scrcpy / emulators that hold the phone, then enable USB debugging, plug the cable, press “Connect USB” and allow the RSA prompt on the phone. Chrome 118+ required.", onConnect ? button("Connect USB", { variant: "primary", icon: "usb", onClick: onConnect }) : undefined), { icon: "usb" });
}
export async function withBusy(buttonEl, task) {
    const previous = buttonEl?.disabled ?? false;
    if (buttonEl)
        buttonEl.disabled = true;
    try {
        return await task();
    }
    finally {
        if (buttonEl)
            buttonEl.disabled = previous;
    }
}
export function infoRow(label, value) {
    return el("div", { class: "row", style: "justify-content:space-between;gap:16px" }, el("span", { class: "muted small" }, label), el("span", { class: "mono", style: "font-size:12px;text-align:right;word-break:break-all" }, value));
}
export function sectionTitle(text, iconName) {
    return el("div", { class: "row", style: "margin:2px 0 4px" }, iconName ? icon(iconName, 15) : null, el("b", { style: "font-size:12.5px" }, text));
}
export function errorBox(message) {
    return el("div", { class: "hint warn" }, message);
}
export function stat(label, value, hint) {
    return el("div", { class: "card", style: "padding:13px 15px" }, el("div", { class: "muted small", style: "letter-spacing:.06em;text-transform:uppercase;font-size:10px;font-weight:700" }, label), el("div", { style: "font-size:19px;font-weight:700;margin-top:3px;letter-spacing:-.3px" }, value), hint ? el("div", { class: "muted small", style: "margin-top:2px" }, hint) : null);
}
export function field(label, control) {
    return el("div", { class: "field" }, el("label", null, label), control);
}
