/**
 * Right-click long press via `adb shell input`. Mouse clicks/drags themselves
 * use scrcpy's touch control channel (see scrcpy-streamer.js).
 */
const coordinate = (value) => Math.max(0, Math.round(Number(value) || 0));

/** Long press at one point (zero-distance swipe with a duration). */
export async function longPress(adb, x, y, { durationMs = 700, timeoutMs = 10_000 } = {}) {
  const duration = Math.max(1, Math.round(durationMs));
  const px = coordinate(x);
  const py = coordinate(y);
  await adb.shell(`input swipe ${px} ${py} ${px} ${py} ${duration}`, timeoutMs);
}
