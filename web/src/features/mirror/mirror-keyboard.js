import { androidKeyEvent } from "./mirror-keymap.js";

/**
 * Mirror keyboard router.
 *
 * Keys mode (default) forwards raw key down/up events to Android, so Space and
 * arrow keys control media, games get WASD, etc.
 *
 * Text mode is summoned with F2, focuses a hidden input for IME, and
 * buffers text; Enter commits the buffer and returns to keys mode.
 */
export function createMirrorKeyboard({
  doc,
  win = doc.defaultView,
  onCommit = () => {},
  onShortcut = () => false,
  onKey = () => {},
  onEmptyEnter = () => {},
  onEmptyBackspace = () => {},
  onModeChange = () => {},
  log = () => {},
}) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const pressed = new Map();
  let disposed = false;
  let textMode = false;
  let composing = false;
  let composeStart = 0;
  let composeLength = 0;

  const style = doc.createElement("style");
  style.textContent =
    "body{position:relative}" +
    ".kbd-buffer{position:absolute;top:0;left:0;max-width:100%;padding:3px 8px;background:#555c;" +
    "color:#fff;font:13px/1.45 system-ui,sans-serif;white-space:pre-wrap;word-break:break-all;" +
    "pointer-events:none;border-radius:0 0 6px 0;z-index:10}" +
    ".kbd-selected{background:#2563eb;color:#fff;border-radius:2px;" +
    "box-shadow:0 0 0 1px #93c5fd inset;text-decoration:underline;text-underline-offset:2px}" +
    ".kbd-input{position:absolute;top:0;left:0;width:100%;height:22px;padding:0;margin:0;border:0;" +
    "background:transparent;color:transparent;opacity:0.01;" +
    "pointer-events:none;font:13px system-ui,sans-serif;z-index:9}";
  doc.head.appendChild(style);

  const view = doc.createElement("div");
  view.className = "kbd-buffer";
  view.hidden = true;
  doc.body.appendChild(view);

  const input = doc.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.className = "kbd-input";
  input.setAttribute("aria-hidden", "true");
  doc.body.appendChild(input);

  const fail = (error) => log(`keyboard error: ${error?.message || error}`);
  const run = (fn, ...args) => {
    try {
      void Promise.resolve(fn(...args)).catch(fail);
    } catch (error) {
      fail(error);
    }
  };

  const paint = () => {
    const value = input.value;
    view.textContent = "";
    if (!textMode || !value) {
      view.hidden = true;
      return;
    }
    const focused = doc.activeElement === input;
    let start = focused ? (input.selectionStart ?? value.length) : value.length;
    let end = focused ? (input.selectionEnd ?? value.length) : value.length;
    if (composing) {
      start = composeStart;
      end = composeStart + composeLength;
    }
    start = Math.max(0, Math.min(start, value.length));
    end = Math.max(0, Math.min(end, value.length));
    if (start > end) [start, end] = [end, start];
    if (start < end) {
      const mark = doc.createElement("span");
      mark.className = "kbd-selected";
      mark.textContent = value.slice(start, end);
      view.append(value.slice(0, start), mark, value.slice(end));
    } else {
      view.textContent = value;
    }
    view.hidden = false;
  };

  const setValue = (value) => {
    input.value = value;
    input.setSelectionRange?.(value.length, value.length);
    paint();
  };
  const ensureFocus = () => {
    if (disposed) return;
    try {
      win?.focus?.();
      if (textMode) input.focus?.({ preventScroll: true });
    } catch {
      /* the PiP window may already be closing */
    }
  };
  const releaseKeys = () => {
    for (const { keyCode, metaState } of pressed.values()) {
      run(onKey, "up", keyCode, metaState, 0);
    }
    pressed.clear();
  };
  const setMode = (on) => {
    if (disposed || textMode === on) return;
    releaseKeys();
    textMode = on;
    if (on) {
      paint();
      ensureFocus();
    } else {
      setValue("");
      input.blur();
      view.hidden = true;
      win?.focus?.();
    }
    onModeChange(on);
  };
  const commit = () => {
    const text = input.value;
    setValue("");
    if (text) {
      log(`commit ${text.length} chars`);
      run(onCommit, text);
    } else {
      run(onEmptyEnter);
    }
    setMode(false);
  };

  const onKeyDown = (event) => {
    if (disposed) return;
    if (event.code === "F2") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) setMode(!textMode);
      return;
    }
    if (textMode) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        if (onShortcut(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) commit();
        return;
      }
      if (event.key === "Backspace") {
        if (!input.value) {
          event.preventDefault();
          event.stopPropagation();
          onEmptyBackspace();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMode(false);
      }
      return;
    }

    if (event.isComposing || event.keyCode === 229) return;
    const mapped = androidKeyEvent(event);
    if (!mapped) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) {
      run(onKey, "down", mapped.keyCode, mapped.metaState, 1);
      return;
    }
    pressed.set(event.code, mapped);
    run(onKey, "down", mapped.keyCode, mapped.metaState, 0);
  };

  const onKeyUp = (event) => {
    if (disposed || textMode) return;
    const entry = pressed.get(event.code);
    if (!entry) return;
    pressed.delete(event.code);
    event.preventDefault();
    event.stopPropagation();
    run(onKey, "up", entry.keyCode, entry.metaState, 0);
  };

  input.addEventListener("compositionstart", () => {
    composing = true;
    composeStart = input.selectionStart ?? input.value.length;
    composeLength = 0;
    paint();
  }, { signal });
  input.addEventListener("compositionupdate", (event) => {
    composing = true;
    composeLength = (event.data ?? "").length;
    paint();
  }, { signal });
  input.addEventListener("compositionend", () => {
    composing = false;
    composeLength = 0;
    paint();
  }, { signal });
  input.addEventListener("input", (event) => {
    if (composing && event.data) composeLength = Math.max(composeLength, event.data.length);
    paint();
  }, { signal });
  input.addEventListener("focus", paint, { signal });
  input.addEventListener("blur", paint, { signal });
  doc.addEventListener("selectionchange", () => {
    if (doc.activeElement === input) paint();
  }, { signal });

  win.addEventListener("keydown", onKeyDown, { capture: true, signal });
  win.addEventListener("keyup", onKeyUp, { capture: true, signal });
  win.addEventListener("blur", releaseKeys, { signal });
  win.addEventListener("focus", ensureFocus, { signal });
  win.addEventListener("pointerdown", ensureFocus, { capture: true, signal });

  return {
    ensureFocus,
    dispose() {
      disposed = true;
      releaseKeys();
      listeners.abort();
      input.remove();
      view.remove();
      style.remove();
    },
  };
}
