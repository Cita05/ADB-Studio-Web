import assert from "node:assert/strict";
import test from "node:test";
import { androidKeyEvent, META } from "../src/features/mirror/mirror-keymap.js";

const event = (code, overrides = {}) => ({
  code,
  key: "",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...overrides,
});

test("media and navigation keys map to Android key codes", () => {
  assert.equal(androidKeyEvent(event("Space")).keyCode, 62);
  assert.equal(androidKeyEvent(event("ArrowLeft")).keyCode, 21);
  assert.equal(androidKeyEvent(event("ArrowRight")).keyCode, 22);
  assert.equal(androidKeyEvent(event("MediaPlayPause")).keyCode, 85);
});

test("letters, digits and modifiers map", () => {
  assert.deepEqual(androidKeyEvent(event("KeyA")), { keyCode: 29, metaState: 0 });
  assert.deepEqual(androidKeyEvent(event("KeyZ")), { keyCode: 54, metaState: 0 });
  assert.deepEqual(androidKeyEvent(event("Digit1")), { keyCode: 8, metaState: 0 });
  assert.deepEqual(androidKeyEvent(event("KeyC", { ctrlKey: true, shiftKey: true })), {
    keyCode: 31,
    metaState: META.ctrl | META.shift,
  });
});

test("unmapped keys are left to the browser", () => {
  assert.equal(androidKeyEvent(event("ShiftLeft")), null);
  assert.equal(androidKeyEvent(event("F13")), null);
});
