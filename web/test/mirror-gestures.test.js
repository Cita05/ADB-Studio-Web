import assert from "node:assert/strict";
import test from "node:test";
import { mapClientPoint, normalizeWheelDelta } from "../src/features/mirror/mirror-gestures.js";

const RECT = { left: 100, top: 50, width: 300, height: 600 };

test("mapClientPoint converts viewport coordinates to device pixels", () => {
  assert.deepEqual(mapClientPoint(RECT, 1080, 2160, 250, 350), { x: 540, y: 1080 });
});

test("mapClientPoint rejects out-of-canvas and empty geometry", () => {
  assert.equal(mapClientPoint(RECT, 1080, 2160, 99, 350), null);
  assert.equal(mapClientPoint(RECT, 1080, 2160, 400, 350), null);
  assert.equal(mapClientPoint(RECT, 1080, 2160, 250, 49), null);
  assert.equal(mapClientPoint(RECT, 0, 2160, 250, 350), null);
  assert.equal(mapClientPoint(null, 1080, 2160, 250, 350), null);
});

test("normalizeWheelDelta converts lines/pages and caps huge values", () => {
  assert.equal(normalizeWheelDelta(100, 0), 100);
  assert.equal(normalizeWheelDelta(3, 1), 48);
  assert.equal(normalizeWheelDelta(1, 2), 400);
  assert.equal(normalizeWheelDelta(10000, 0), 1200);
  assert.equal(normalizeWheelDelta(-10000, 0), -1200);
});
