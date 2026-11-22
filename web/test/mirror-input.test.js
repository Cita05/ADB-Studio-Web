import assert from "node:assert/strict";
import test from "node:test";
import { createMirrorInput } from "../src/features/mirror/mirror-input.js";

/** Minimal EventTarget: enough to exercise listener lifecycle and dispatch. */
class FakeEventTarget {
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

  dispatch(type, event) {
    for (const { handler } of [...(this.listeners.get(type) ?? [])]) handler(event);
  }
}

class FakeCanvas extends FakeEventTarget {
  constructor(document) {
    super();
    this.ownerDocument = document;
    this.width = 1000;
    this.height = 2000;
  }

  setPointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 500, height: 1000 };
  }
}

function event(overrides = {}) {
  return {
    button: 0,
    buttons: 0,
    clientX: 0,
    clientY: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    pointerId: 1,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    ...overrides,
  };
}

function setup() {
  const commands = [];
  const errors = [];
  const scrolled = [];
  const touches = [];
  const adb = {
    connected: true,
    shell: async (...args) => {
      commands.push(args);
      return { stdout: "", stderr: "", code: 0 };
    },
  };
  const win = new FakeEventTarget();
  win.setTimeout = (fn, ms) => setTimeout(fn, ms);
  win.clearTimeout = (id) => clearTimeout(id);
  const doc = new FakeEventTarget();
  doc.defaultView = win;
  const canvas = new FakeCanvas(doc);
  const input = createMirrorInput({
    adb,
    canvas,
    onError: (error) => errors.push(error),
    onScroll: (payload) => {
      scrolled.push(payload);
      return Promise.resolve();
    },
    onTouch: (action, point) => {
      touches.push({ action, ...point });
      return Promise.resolve();
    },
  });
  return { commands, errors, scrolled, touches, adb, win, doc, canvas, input };
}

const commandOf = (commands, index = 0) => commands[index]?.[0];

test("wheel down sends a precise scroll at the pointer", () => {
  const { commands, scrolled, doc, input } = setup();
  const wheel = event({ clientX: 250, clientY: 500, deltaY: 100 });
  doc.dispatch("wheel", wheel);

  assert.equal(wheel.defaultPrevented, true);
  assert.equal(commands.length, 0);
  assert.deepEqual(scrolled, [{ x: 500, y: 1000, deltaX: 0, deltaY: -1 }]);
  input.dispose();
});

test("wheel up sends a positive precise scroll", () => {
  const { scrolled, doc, input } = setup();
  doc.dispatch("wheel", event({ clientX: 250, clientY: 500, deltaY: -100 }));
  assert.deepEqual(scrolled, [{ x: 500, y: 1000, deltaX: 0, deltaY: 1 }]);
  input.dispose();
});

test("wheel deltaMode lines are converted to scroll units", () => {
  const { scrolled, doc, input } = setup();
  doc.dispatch("wheel", event({ clientX: 250, clientY: 500, deltaY: 3, deltaMode: 1 }));
  assert.deepEqual(scrolled, [{ x: 500, y: 1000, deltaX: 0, deltaY: -0.48 }]);
  input.dispose();
});

test("left click emits touch down/up", () => {
  const { touches, commands, canvas, input } = setup();
  canvas.dispatch("pointerdown", event({ clientX: 250, clientY: 500 }));
  canvas.dispatch("pointerup", event({ clientX: 250, clientY: 500 }));

  assert.deepEqual(touches, [
    { action: "down", x: 500, y: 1000 },
    { action: "up", x: 500, y: 1000 },
  ]);
  assert.equal(commands.length, 0);
  input.dispose();
});

test("left drag emits down/move/up so long-press drag can start", () => {
  const { touches, commands, canvas, input } = setup();
  canvas.dispatch("pointerdown", event({ clientX: 250, clientY: 500 }));
  canvas.dispatch("pointermove", event({ clientX: 250, clientY: 400, buttons: 1 }));
  canvas.dispatch("pointerup", event({ clientX: 250, clientY: 300 }));

  assert.deepEqual(touches, [
    { action: "down", x: 500, y: 1000 },
    { action: "move", x: 500, y: 800 },
    { action: "up", x: 500, y: 600 },
  ]);
  assert.equal(commands.length, 0);
  input.dispose();
});

test("right click long-presses at the pointer position", () => {
  const { commands, canvas, input } = setup();
  const down = event({ button: 2, clientX: 250, clientY: 500 });
  canvas.dispatch("pointerdown", down);
  assert.equal(down.defaultPrevented, true);
  assert.equal(commandOf(commands), "input swipe 500 1000 500 1000 700");
  input.dispose();
});

test("mouse middle/back/forward buttons map to recents/back/home and block browser defaults", () => {
  const { commands, win, input } = setup();

  for (const button of [1, 3, 4]) {
    const down = event({ button });
    win.dispatch("mousedown", down);
    assert.equal(down.defaultPrevented, true);
  }

  assert.equal(commandOf(commands, 0), "input keyevent 187");
  assert.equal(commandOf(commands, 1), "input keyevent 4");
  assert.equal(commandOf(commands, 2), "input keyevent 3");

  for (const type of ["mouseup", "auxclick"]) {
    for (const button of [1, 3, 4]) {
      const e = event({ button });
      win.dispatch(type, e);
      assert.equal(e.defaultPrevented, true);
    }
  }

  input.dispose();
});

test("wheel is ignored without a connection or with Ctrl held", () => {
  const disconnected = setup();
  disconnected.adb.connected = false;
  disconnected.doc.dispatch("wheel", event({ clientX: 250, clientY: 500, deltaY: 100 }));
  assert.equal(disconnected.scrolled.length, 0);
  disconnected.input.dispose();

  const ctrl = setup();
  ctrl.doc.dispatch("wheel", event({ clientX: 250, clientY: 500, deltaY: 100, ctrlKey: true }));
  assert.equal(ctrl.scrolled.length, 0);
  ctrl.input.dispose();
});

test("dispose removes every listener and timer", async () => {
  const { commands, scrolled, touches, canvas, win, doc, input } = setup();
  input.dispose();

  doc.dispatch("wheel", event({ clientX: 250, clientY: 500, deltaY: 100 }));
  canvas.dispatch("pointerdown", event({ button: 2, clientX: 250, clientY: 500 }));
  canvas.dispatch("pointerdown", event({ clientX: 250, clientY: 500 }));
  canvas.dispatch("pointermove", event({ clientX: 250, clientY: 400, buttons: 1 }));
  canvas.dispatch("pointerup", event({ clientX: 250, clientY: 500 }));
  win.dispatch("mousedown", event({ button: 3 }));

  await Promise.resolve();
  assert.equal(commands.length, 0);
  assert.equal(scrolled.length, 0);
  assert.equal(touches.length, 0);
});
