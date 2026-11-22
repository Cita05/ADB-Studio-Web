/** Pure canvas→device geometry, independent of DOM and ADB. */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Map viewport coordinates to device pixels; null when outside the canvas. */
export function mapClientPoint(rect, width, height, clientX, clientY) {
  if (!rect?.width || !rect?.height || !width || !height) return null;
  const x = Math.round(((clientX - rect.left) / rect.width) * width);
  const y = Math.round(((clientY - rect.top) / rect.height) * height);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

/** Normalize wheel deltas (pixel/line/page) to a capped CSS-pixel value. */
export function normalizeWheelDelta(deltaY, deltaMode = 0) {
  const factor = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  return clamp((Number(deltaY) || 0) * factor, -1200, 1200);
}
