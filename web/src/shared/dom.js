/* Tiny DOM toolkit: no framework, no innerHTML for untrusted text. */
export function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (value == null || value === false)
                continue;
            if (key === "class")
                node.className = String(value);
            else if (key === "html")
                node.innerHTML = String(value);
            else if (key === "dataset") {
                for (const [dk, dv] of Object.entries(value))
                    node.dataset[dk] = dv;
            }
            else if (key === "style" && typeof value === "object") {
                Object.assign(node.style, value);
            }
            else if (key.startsWith("on") && typeof value === "function") {
                node.addEventListener(key.slice(2).toLowerCase(), value);
            }
            else if (key === "value" || key === "checked" || key === "disabled" || key === "selected") {
                node[key] = value;
            }
            else {
                node.setAttribute(key, String(value));
            }
        }
    }
    append(node, children);
    return node;
}
export function append(parent, children) {
    for (const child of children.flat()) {
        if (child == null || child === false)
            continue;
        parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}
export const clear = (node) => node.replaceChildren();
export function byId(id) {
    return document.getElementById(id);
}
/* ── icons (stroke style, 24px grid) ─────────────────────────────────── */
const ICON_PATHS = {
    usb: '<path d="M12 21V7"/><circle cx="12" cy="4.5" r="1.6"/><path d="M12 7l-3.5 3.5"/><path d="M12 11l3.5-3.5"/><path d="M8.5 10.5v3a2 2 0 0 0 2 2h1.5"/><rect x="5" y="16.5" width="3" height="3" rx="0.6"/><path d="M15 7.5l2 2-2 2"/>',
    wifi: '<path d="M3 9.5a15 15 0 0 1 18 0"/><path d="M6.2 13a10 10 0 0 1 11.6 0"/><path d="M9.5 16.5a5 5 0 0 1 5 0"/><circle cx="12" cy="20" r="0.9" fill="currentColor"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.2"/><path d="M20 4.5V11h-6.2"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20h6"/><path d="M12 16.5V20"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.6h3"/>',
    apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    display: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M7 21h10"/><path d="M9 8h6"/><path d="M9 12h3"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2.4"/><path d="M21.5 10.5v3"/><path d="M6 11h5v2H6z" fill="currentColor" stroke="none"/>',
    sliders: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
    script: '<path d="M7 3.5h7l4.5 4.5V20.5H7z"/><path d="M14 3.5V8h4.5"/><path d="M9.5 12h6"/><path d="M9.5 15.5h6"/>',
    bot: '<rect x="4" y="7.5" width="16" height="12" rx="3"/><path d="M12 4v3.5"/><circle cx="9" cy="13" r="1.1" fill="currentColor"/><circle cx="15" cy="13" r="1.1" fill="currentColor"/><path d="M9.5 16.5h5"/>',
    plug: '<path d="M9 3v5"/><path d="M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    home: '<path d="M4 10.5 12 3l8 7.5"/><path d="M6 9.5V20h12V9.5"/>',
    back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    recents: '<rect x="4" y="4" width="12" height="16" rx="2"/><path d="M18 7v13"/>',
    volup: '<path d="M4 9.5h3l5-4v13l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    voldown: '<path d="M4 9.5h3l5-4v13l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    mute: '<path d="M4 9.5h3l5-4v13l-5-4H4z"/><path d="M17 9.5l5 5"/><path d="M22 9.5l-5 5"/>',
    camera: '<path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4z"/><circle cx="12" cy="14" r="3.2"/>',
    play: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.6"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/>',
    folder: '<path d="M3 6.5h6l2 2.5h10v10.5H3z"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19.5h16"/>',
    upload: '<path d="M12 20V9"/><path d="M7.5 13.5 12 9l4.5 4.5"/><path d="M4 4.5h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    check: '<path d="M4.5 12.5 9.5 18 20 6.5"/>',
    alert: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r="0.9" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor"/>',
    link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.8 4.7a4 4 0 0 1 5.6 5.6L16.6 12"/><path d="M7.4 12 5.6 13.8a4 4 0 0 0 5.6 5.6L13 17.6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12 20 3"/><path d="M17 6l2.5 2.5"/><path d="M19.5 3.5 22 6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7.2l2.6 1.5M17.2 15.3l2.6 1.5M4.2 16.8l2.6-1.5M17.2 8.7l2.6-1.5"/>',
    chat: '<path d="M4 5.5h16v11H9.5L5 20.5V16H4z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5H6.5A1.5 1.5 0 0 0 5 7v8.5"/>',
    send: '<path d="M4 12 20.5 4.5 14 20l-2.5-6z"/><path d="M11.5 14 20.5 4.5"/>',
    sparkles: '<path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9z"/><path d="M18.5 16.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/>',
    maximize: '<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M15 4h5v5"/><path d="M9 20H4v-5"/>',
    minimize: '<path d="M9 4v5H4"/><path d="M15 20v-5h5"/><path d="M20 9h-5V4"/><path d="M4 15h5v5"/>',
    rocket: '<path d="M13.5 4.5c3-3 6.5-1.5 6.5-1.5s1.5 3.5-1.5 6.5L12 16l-4-4z"/><path d="M8 12l-3.5 1L3 16.5 7 15"/><path d="M12 16l-1 3.5L14.5 21 16 17"/>',
    cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 2.5v4M14 2.5v4M10 17.5v4M14 17.5v4M2.5 10h4M2.5 14h4M17.5 10h4M17.5 14h4"/>',
};
export function icon(name, size = 18) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICON_PATHS[name] ?? ICON_PATHS.info;
    return svg;
}
/* ── toasts ──────────────────────────────────────────────────────────── */
let toastHost = null;
function ensureToastHost() {
    if (!toastHost) {
        toastHost = el("div", { class: "toast-host" });
        document.body.appendChild(toastHost);
    }
    return toastHost;
}
export function toast(message, kind = "info", ms = 3600) {
    const host = ensureToastHost();
    const node = el("div", { class: `toast ${kind}` }, el("i", { class: "bar" }), el("div", { class: "grow" }, message));
    host.appendChild(node);
    window.setTimeout(() => {
        node.classList.add("out");
        window.setTimeout(() => node.remove(), 220);
    }, ms);
}
export function modal(opts) {
    const body = el("div", { class: "modal-body" });
    append(body, [opts.body]);
    const close = () => {
        host.remove();
        document.removeEventListener("keydown", onKey);
        opts.onClose?.();
    };
    const onKey = (e) => {
        if (e.key === "Escape")
            close();
    };
    const host = el("div", { class: "modal-host" }, el("div", { class: `modal${opts.wide ? " wide" : ""}` }, el("div", { class: "modal-head" }, el("h2", null, opts.title), el("button", { class: "modal-close", title: "Close", onclick: close }, icon("x", 16))), body, opts.footer ? el("div", { class: "modal-foot" }, ...opts.footer) : null));
    host.addEventListener("mousedown", (e) => {
        if (e.target === host)
            close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(host);
    return { root: host, body, close };
}
export function confirmDialog(message, opts) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
            if (done)
                return;
            done = true;
            handle.close();
            resolve(value);
        };
        const handle = modal({
            title: opts?.title ?? "Confirm",
            body: el("p", { style: "margin:0;line-height:1.7" }, message),
            footer: [
                el("button", { class: "btn ghost", onclick: () => finish(false) }, "Cancel"),
                el("button", { class: `btn ${opts?.danger ? "danger" : "primary"}`, onclick: () => finish(true) }, "Confirm"),
            ],
            onClose: () => finish(false),
        });
    });
}
let promptResolve = null;
export function promptDialog(opts) {
    promptResolve?.(null);
    return new Promise((resolve) => {
        promptResolve = resolve;
        const input = el("input", {
            class: "input",
            value: opts.value ?? "",
            placeholder: opts.placeholder ?? "",
            style: "margin-top:6px",
        });
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter")
                finish(input.value.trim() || null);
        });
        const finish = (value) => {
            if (!promptResolve)
                return;
            promptResolve = null;
            handle.close();
            resolve(value);
        };
        const handle = modal({
            title: opts.title,
            body: el("div", { class: "field" }, opts.label ? el("label", null, opts.label) : null, input),
            footer: [
                el("button", { class: "btn ghost", onclick: () => finish(null) }, "Cancel"),
                el("button", { class: "btn primary", onclick: () => finish(input.value.trim() || null) }, opts.okText ?? "OK"),
            ],
            onClose: () => {
                if (promptResolve) {
                    promptResolve = null;
                    resolve(null);
                }
            },
        });
        window.setTimeout(() => input.focus(), 30);
    });
}
/* ── small builders ──────────────────────────────────────────────────── */
export function card(title, body, opts) {
    const cardEl = el("section", { class: `card${opts?.class ? " " + opts.class : ""}` }, el("div", { class: "card-head" }, el("div", { class: "card-title" }, opts?.icon ? icon(opts.icon, 15) : null, title), opts?.sub ? el("div", { class: "card-sub" }, opts.sub) : null, opts?.actions?.length ? el("div", { class: "card-actions" }, ...opts.actions) : null), el("div", { class: "card-body" }, ...(Array.isArray(body) ? body : [body])));
    return cardEl;
}
export function button(label, opts = {}) {
    const cls = ["btn", opts.variant ?? "", opts.small ? "small" : ""].filter(Boolean).join(" ");
    return el("button", {
        class: cls,
        title: opts.title,
        disabled: opts.disabled,
        onclick: opts.onClick ?? null,
    }, opts.icon ? icon(opts.icon, opts.small ? 14 : 15) : null, label);
}
export function badge(text, kind = "") {
    return el("span", { class: `badge ${kind}`.trim() }, text);
}
export function kvList(rows, cls = "") {
    const grid = el("div", { class: `kv ${cls}` });
    for (const [key, value] of rows) {
        grid.appendChild(el("div", null, key));
        grid.appendChild(el("div", null, value));
    }
    return grid;
}
export function emptyState(title, desc, action) {
    return el("div", { class: "empty" }, icon("phone", 42), el("h3", null, title), el("p", null, desc), action ?? null);
}
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        return false;
    }
}
