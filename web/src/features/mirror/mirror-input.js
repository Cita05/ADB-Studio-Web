import { pressKey } from "../../services/adb/keys.js";
import { longPress } from "../../services/adb/touch.js";
import { mapClientPoint, normalizeWheelDelta } from "./mirror-gestures.js";

const LONG_PRESS_MS = 700;
const MOUSE_KEYS = { 1: "recents", 3: "back", 4: "home" };

/** Map mirror-window mouse events to Android input. */
export function createMirrorInput({
  adb,
  canvas,
  onError = () => {},
  onInteraction = () => {},
  onScroll = () => {},
  onTouch = () => {},
}) {
  const doc = canvas.ownerDocument;
  const win = doc?.defaultView;
  if (!win) throw new Error("Mirror input requires an attached canvas");

  const listeners = new AbortController();
  const { signal } = listeners;
  let disposed = false;
  let down = null;

  const fail = (error) => {
    if (!disposed) onError(error);
  };

  const mapPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return mapClientPoint(rect, canvas.width, canvas.height, event.clientX, event.clientY);
  };

  const sendTouch = (action, point) => {
    void Promise.resolve(onTouch(action, point)).catch(fail);
  };

  const onWheel = (event) => {
    if (disposed || !adb.connected || event.ctrlKey) return;
    const point = mapPoint(event);
    if (!point) return;
    onInteraction();
    event.preventDefault();
    // Browser deltaY>0 means wheel down, while scrcpy's positive scroll axis
    // means "scroll up" (content down), so invert both axes.
    const deltaX = 0 - normalizeWheelDelta(event.deltaX, event.deltaMode) / 100;
    const deltaY = 0 - normalizeWheelDelta(event.deltaY, event.deltaMode) / 100;
    if (!deltaX && !deltaY) return;
    void Promise.resolve(onScroll({ ...point, deltaX, deltaY })).catch(fail);
  };

  const onPointerDown = (event) => {
    if (disposed || !adb.connected) return;
    onInteraction();
    if (event.button === 2) {
      event.preventDefault();
      const point = mapPoint(event);
      if (point) void longPress(adb, point.x, point.y, { durationMs: LONG_PRESS_MS }).catch(fail);
      return;
    }
    if (event.button !== 0) return;
    const point = mapPoint(event);
    if (!point) return;
    down = { pointerId: event.pointerId, last: point };
    canvas.setPointerCapture?.(event.pointerId);
    sendTouch("down", point);
  };

  const onPointerMove = (event) => {
    if (disposed || !down || !adb.connected || !(event.buttons & 1)) return;
    const point = mapPoint(event);
    if (!point) return;
    if (point.x === down.last.x && point.y === down.last.y) return;
    down.last = point;
    sendTouch("move", point);
  };

  const onPointerUp = (event) => {
    if (event.button !== 0) return;
    const start = down;
    down = null;
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    onInteraction();
    if (disposed || !start || !adb.connected) return;
    sendTouch("up", mapPoint(event) ?? start.last);
  };

  const onPointerCancel = (event) => {
    const start = down;
    down = null;
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    onInteraction();
    if (start && adb.connected) sendTouch("up", start.last);
  };

  const isMouseKey = (event) => event.button in MOUSE_KEYS;

  const onMouseDown = (event) => {
    if (!isMouseKey(event)) return;
    if (disposed || !adb.connected) return;
    onInteraction();
    event.preventDefault();
    event.stopPropagation();
    void pressKey(adb, MOUSE_KEYS[event.button]).catch(fail);
  };

  const swallowMouseKey = (event) => {
    if (!isMouseKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onCanvasMouseDown = (event) => {
    // Prevent mouse down on canvas from stealing DOM focus from the capture input.
    if (event.button === 0 || event.button === 2) {
      event.preventDefault();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown, { signal });
  canvas.addEventListener("pointermove", onPointerMove, { signal });
  canvas.addEventListener("pointerup", onPointerUp, { signal });
  canvas.addEventListener("pointercancel", onPointerCancel, { signal });
  canvas.addEventListener("mousedown", onCanvasMouseDown, { signal });
  doc.addEventListener("wheel", onWheel, { passive: false, signal });
  doc.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  win.addEventListener("mousedown", onMouseDown, { capture: true, signal });
  win.addEventListener("mouseup", swallowMouseKey, { capture: true, signal });
  win.addEventListener("auxclick", swallowMouseKey, { capture: true, signal });

  return {
    dispose() {
      disposed = true;
      listeners.abort();
      down = null;
    },
  };
}
