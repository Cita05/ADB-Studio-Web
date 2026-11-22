import { settings } from "../core/settings.js";
import { stripAnsi } from "../shared/format.js";
import { button, el, icon } from "../shared/dom.js";

const MAX_LINES = 700;

/**
 * Right-hand ADB console: streams the controller log, accepts adb-style
 * commands and keeps a small unread counter while collapsed.
 */
export function createConsoleDock({ adb, onChange }) {
  let unread = 0;
  let body = null;
  let input = null;
  let busy = false;
  const entries = [];
  const dock = el("aside", { class: "dock" });

  const isOpen = () => settings.get().dockOpen;

  const appendLine = (entry) => {
    body?.appendChild(
      el("div", { class: `log-line ${entry.kind}` }, el("span", { class: "ts" }, entry.time), stripAnsi(entry.text)),
    );
    while (body && body.childElementCount > MAX_LINES) body.firstElementChild?.remove();
  };

  const scrollToEnd = () => {
    if (!body) return;
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 160;
    if (nearBottom) body.scrollTop = body.scrollHeight;
  };

  const clear = () => {
    entries.length = 0;
    body?.replaceChildren();
  };

  const runLine = async () => {
    const line = input?.value.trim();
    if (!line || busy) return;
    input.value = "";
    if (["clear", "cls"].includes(line.toLowerCase())) {
      clear();
      return;
    }
    busy = true;
    try {
      await adb.runAdbLine(line);
    } finally {
      busy = false;
      input.focus();
    }
  };

  const render = () => {
    dock.replaceChildren();
    dock.classList.toggle("collapsed", !isOpen());

    body = el("div", { class: "dock-body" });
    for (const entry of entries) appendLine(entry);

    input = el("input", {
      class: "input",
      style: "height:36px;font-family:var(--mono);font-size:12.5px",
      placeholder: "Type shell commands, adb-style: shell input keyevent 3",
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void runLine();
    });

    const runBtn = button("Run", { variant: "primary", small: true, onClick: () => void runLine() });
    const clearBtn = button("", {
      icon: "trash",
      small: true,
      title: "Clear",
      onClick: clear,
    });

    dock.append(
      el(
        "div",
        { class: "dock-head" },
        icon("terminal", 15),
        el("span", null, "ADB terminal"),
        el("div", { class: "spacer" }),
        clearBtn,
      ),
      body,
      el("div", { class: "dock-input" }, input, runBtn),
    );
    scrollToEnd();
  };

  const toggle = () => {
    const open = !isOpen();
    settings.patch({ dockOpen: open });
    dock.classList.toggle("collapsed", !open);
    if (open) {
      unread = 0;
      scrollToEnd();
      input?.focus();
    }
    onChange?.();
  };

  adb.onLog((entry) => {
    entries.push(entry);
    if (entries.length > MAX_LINES) entries.shift();
    if (!body) return;
    appendLine(entry);
    if (!isOpen()) {
      unread += 1;
      onChange?.();
    }
    scrollToEnd();
  });

  return {
    el: dock,
    render,
    toggle,
    get unread() {
      return unread;
    },
  };
}
