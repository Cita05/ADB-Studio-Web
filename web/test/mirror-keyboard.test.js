import assert from "node:assert/strict";
import test from "node:test";
import { createMirrorKeyboard } from "../src/features/mirror/mirror-keyboard.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    const signal = typeof options === "object" ? options.signal : undefined;
    if (signal?.aborted) return;
    const entry = { handler };
    const list = this.listeners.get(type) ?? [];
    list.push(entry);
    this.listeners.set(type, list);
    signal?.addEventListener(
      "abort",
      () => {
        const current = this.listeners.get(type) ?? [];
        this.listeners.set(
          type,
          current.filter((item) => item !== entry),
        );
      },
      { once: true },
    );
  }

  dispatch(type, event = {}) {
    for (const { handler } of [...(this.listeners.get(type) ?? [])]) handler(event);
  }
}

class FakeElement extends FakeTarget {
  constructor(tag, doc) {
    super();
    this.tag = tag;
    this.doc = doc;
    this.className = "";
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.focused = false;
    this.removed = false;
  }

  focus() {
    this.focused = true;
    if (this.doc) this.doc.activeElement = this;
  }

  blur() {
    this.focused = false;
    if (this.doc?.activeElement === this) this.doc.activeElement = null;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  setAttribute() {}

  append(...nodes) {
    this.textContent += nodes
      .map((node) => (typeof node === "string" ? node : (node?.textContent ?? "")))
      .join("");
  }

  remove() {
    this.removed = true;
  }
}

function setup() {
  const win = new FakeTarget();
  win.focus = () => {};
  win.setTimeout = (fn) => setTimeout(fn, 0);
  const doc = new FakeTarget();
  doc.defaultView = win;
  doc.activeElement = null;
  doc.hasFocus = () => true;
  const head = [];
  const body = [];
  doc.head = { appendChild: (node) => head.push(node) };
  doc.body = { appendChild: (node) => body.push(node) };
  doc.createElement = (tag) => new FakeElement(tag, doc);

  const events = { commits: [], shortcuts: [], keys: [], modes: [], emptyEnter: 0, emptyBackspace: 0 };
  const keyboard = createMirrorKeyboard({
    doc,
    win,
    onCommit: (text) => events.commits.push(text),
    onShortcut: (event) => {
      events.shortcuts.push(event.key);
      return true;
    },
    onKey: (action, keyCode, metaState, repeat) =>
      events.keys.push({ action, keyCode, metaState, repeat }),
    onModeChange: (textMode) => events.modes.push(textMode),
    onEmptyEnter: () => (events.emptyEnter += 1),
    onEmptyBackspace: () => (events.emptyBackspace += 1),
  });
  const view = body.find((node) => node.className === "kbd-buffer");
  const input = body.find((node) => node.className === "kbd-input");
  const style = head.find((node) => node.textContent.includes(".kbd-buffer"));
  return { win, doc, keyboard, view, input, style, events };
}

function keyEvent(key, overrides = {}) {
  return {
    key,
    code: overrides.code ?? key,
    keyCode: 0,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

const toggle = (win) => win.dispatch("keydown", keyEvent("F2", { code: "F2" }));

test("keys mode forwards Space and arrows to Android", () => {
  const { win, events } = setup();
  const space = keyEvent(" ", { code: "Space" });
  win.dispatch("keydown", space);
  win.dispatch("keyup", keyEvent(" ", { code: "Space" }));
  assert.equal(space.defaultPrevented, true);
  assert.deepEqual(events.keys, [
    { action: "down", keyCode: 62, metaState: 0, repeat: 0 },
    { action: "up", keyCode: 62, metaState: 0, repeat: 0 },
  ]);

  win.dispatch("keydown", keyEvent("ArrowLeft", { code: "ArrowLeft" }));
  win.dispatch("keyup", keyEvent("ArrowLeft", { code: "ArrowLeft" }));
  assert.equal(events.keys[2].keyCode, 21);
  assert.equal(events.keys[2].action, "down");
});

test("keys mode forwards Ctrl shortcuts without using the buffer", () => {
  const { win, events } = setup();
  const copy = keyEvent("c", { code: "KeyC", ctrlKey: true });
  win.dispatch("keydown", copy);
  win.dispatch("keyup", keyEvent("c", { code: "KeyC", ctrlKey: true }));
  assert.equal(copy.defaultPrevented, true);
  assert.deepEqual(events.keys, [
    { action: "down", keyCode: 31, metaState: 4096, repeat: 0 },
    { action: "up", keyCode: 31, metaState: 4096, repeat: 0 },
  ]);
  assert.deepEqual(events.shortcuts, []);
});

test("keys mode marks repeats and releases keys on blur", () => {
  const { win, events } = setup();
  win.dispatch("keydown", keyEvent(" ", { code: "Space" }));
  win.dispatch("keydown", keyEvent(" ", { code: "Space", repeat: true }));
  assert.deepEqual(events.keys.at(-1), { action: "down", keyCode: 62, metaState: 0, repeat: 1 });
  win.dispatch("blur", {});
  assert.deepEqual(events.keys.at(-1), { action: "up", keyCode: 62, metaState: 0, repeat: 0 });
  assert.equal(events.keys.length, 3);
});

test("text mode buffers typed text, commits on Enter and closes", () => {
  const { win, input, view, events } = setup();
  toggle(win);
  assert.equal(input.focused, true);

  input.value = "hello";
  input.dispatch("input", {});
  assert.equal(view.textContent, "hello");
  assert.equal(view.hidden, false);

  const enter = keyEvent("Enter", { code: "Enter" });
  win.dispatch("keydown", enter);
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(events.commits, ["hello"]);
  assert.deepEqual(events.modes, [true, false]);
  assert.equal(input.value, "");
  assert.equal(view.hidden, true);
});

test("empty Enter sends Enter and leaves text mode; empty Backspace stays", () => {
  const { win, events } = setup();
  toggle(win);
  win.dispatch("keydown", keyEvent("Enter", { code: "Enter" }));
  assert.equal(events.emptyEnter, 1);
  assert.deepEqual(events.modes, [true, false]);

  toggle(win);
  win.dispatch("keydown", keyEvent("Backspace", { code: "Backspace" }));
  assert.equal(events.emptyBackspace, 1);
  assert.deepEqual(events.modes, [true, false, true]);
});

test("text mode Ctrl shortcuts are forwarded; Escape closes text mode", () => {
  const { win, events } = setup();
  toggle(win);
  const copy = keyEvent("c", { code: "KeyC", ctrlKey: true });
  win.dispatch("keydown", copy);
  assert.equal(copy.defaultPrevented, true);
  assert.deepEqual(events.shortcuts, ["c"]);

  win.dispatch("keydown", keyEvent("Escape", { code: "Escape" }));
  assert.deepEqual(events.modes, [true, false]);
  assert.deepEqual(events.keys, []);
});

test("IME-composed text is shown and committed", () => {
  const { win, input, view, events } = setup();
  toggle(win);
  input.value = "中文";
  input.dispatch("input", {});
  assert.equal(view.textContent, "中文");
  win.dispatch("keydown", keyEvent("Enter", { code: "Enter" }));
  assert.deepEqual(events.commits, ["中文"]);
});

test("F2 toggles text mode without being sent to Android", () => {
  const { win, events, input } = setup();
  const f2 = keyEvent("F2", { code: "F2" });
  win.dispatch("keydown", f2);
  assert.equal(f2.defaultPrevented, true);
  assert.equal(input.focused, true);
  assert.deepEqual(events.modes, [true]);
  assert.deepEqual(events.keys, []);

  toggle(win);
  assert.deepEqual(events.modes, [true, false]);
  assert.equal(input.focused, false);
});

test("Shift keys are not mode toggles", () => {
  const { win, events } = setup();
  win.dispatch("keydown", keyEvent("Shift", { code: "ShiftRight" }));
  win.dispatch("keydown", keyEvent("Shift", { code: "ShiftLeft" }));
  assert.deepEqual(events.modes, []);
  assert.deepEqual(events.keys, []);
});

test("Left Shift stays native in text mode", () => {
  const { win, events, input } = setup();
  toggle(win);
  const shift = keyEvent("Shift", { code: "ShiftLeft" });
  win.dispatch("keydown", shift);
  assert.equal(shift.defaultPrevented, false);
  assert.deepEqual(events.modes, [true]);
  assert.deepEqual(events.keys, []);
  assert.equal(input.focused, true);
});

test("switching to text mode releases keys held in keys mode", () => {
  const { win, events } = setup();
  win.dispatch("keydown", keyEvent(" ", { code: "Space" }));
  toggle(win);
  assert.deepEqual(events.keys, [
    { action: "down", keyCode: 62, metaState: 0, repeat: 0 },
    { action: "up", keyCode: 62, metaState: 0, repeat: 0 },
  ]);
  win.dispatch("keyup", keyEvent(" ", { code: "Space" }));
  assert.equal(events.keys.length, 2);
});

test("ensureFocus follows the active mode", () => {
  const { keyboard, win, input } = setup();
  keyboard.ensureFocus();
  assert.equal(input.focused, false);

  toggle(win);
  keyboard.ensureFocus();
  assert.equal(input.focused, true);

  toggle(win);
  keyboard.ensureFocus();
  assert.equal(input.focused, false);
});

test("dispose removes the overlay, input, style and listeners", () => {
  const { win, keyboard, view, input, style } = setup();
  keyboard.dispose();
  assert.equal(view.removed, true);
  assert.equal(input.removed, true);
  assert.equal(style.removed, true);
  win.dispatch("keydown", keyEvent(" ", { code: "Space" }));
  assert.equal(view.textContent, "");
});
