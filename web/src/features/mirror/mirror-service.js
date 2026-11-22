import { withTimeout } from "../../shared/async.js";
import { errorText } from "../../shared/errors.js";
import { pressKey } from "../../services/adb/keys.js";
import { createAudioPlayer } from "./audio-player.js";
import { createMirrorInput } from "./mirror-input.js";
import { createMirrorKeyboard } from "./mirror-keyboard.js";
import { createScrcpyStreamer } from "./scrcpy-streamer.js";
import { openMirrorWindow } from "./float-window.js";

/**
 * Owns the floating screen mirror.
 * Only the bundled scrcpy-server engine is supported; closing the window stops
 * everything. The bottom "Screen Cast" button is the only entry point.
 */
export function createMirrorService({ adb, toast, onStateChange }) {
  let session = null;
  let starting = false;

  const notify = () => onStateChange?.();

  function stop(fromWindow = false) {
    const current = session;
    if (!current) return;
    session = null;
    notify();
    try {
      current.input?.dispose();
    } catch {
      /* ignore */
    }
    try {
      current.keyboard?.dispose();
    } catch {
      /* ignore */
    }
    try {
      current.audio?.close();
    } catch {
      /* ignore */
    }
    try {
      current.engine?.stop();
    } catch {
      /* ignore */
    }
    if (!fromWindow) current.float.close();
  }

  async function start() {
    if (session || starting) return;
    if (!adb.connected) {
      toast("Connect a device first", "warn");
      return;
    }
    starting = true;
    let engine = null;
    let audio = null;
    try {
      // AudioContext must be created synchronously from the click gesture.
      audio = createAudioPlayer({
        onError: (error) => adb.log(`[mirror] audio playback failed: ${errorText(error)}`, "warn"),
        onFrame: () => adb.log("[mirror] audio playing", "ok"),
      });

      // Open the window synchronously from the button gesture (Document PiP
      // requires transient activation); sizing follows once the device answers.
      const float = await openMirrorWindow({
        width: 360,
        height: 800,
        onClose: () => stop(true),
      });
      session = { float, engine: null, input: null, audio };
      notify();
      adb.log("[mirror] floating window opened", "info");

      const size = await adb.screenSize();
      // The user may close the window while we probe/start the device.
      if (!session) return;
      if (size) float.prepare(size.width, size.height);

      if (!("VideoDecoder" in window) || !adb.raw)
        throw new Error("Screen mirror requires WebCodecs (Chrome 118+)");

      engine = createScrcpyStreamer({
        controller: adb,
        canvas: float.canvas,
        audio,
        onFallback: (error) => {
          const detail = errorText(error);
          adb.log(`[mirror] scrcpy failed: ${detail}`, "warn");
          toast(`Screen mirror failed: ${detail}`, "err", 8000);
          stop();
        },
      });
      session.engine = engine;
      await withTimeout(engine.start(), 25_000, "scrcpy start timeout");
      if (!session) {
        engine.stop();
        return;
      }
      adb.log("[mirror] scrcpy stream started", "ok");
      session.input = createMirrorInput({
        adb,
        canvas: float.canvas,
        onError: (error) => toast(errorText(error), "err"),
        onInteraction: () => {
          session?.audio?.resume();
          session?.keyboard?.ensureFocus();
        },
        onScroll: ({ x, y, deltaX, deltaY }) =>
          engine.scroll(x, y, deltaX, deltaY, float.canvas.width, float.canvas.height),
        onTouch: (action, point) =>
          engine.touch(action, point.x, point.y, float.canvas.width, float.canvas.height),
      });
      session.keyboard = createMirrorKeyboard({
        doc: float.doc,
        win: float.win,
        log: (message) => adb.log(`[mirror] ${message}`, "info"),
        onCommit: (text) => {
          engine.sendText(text).catch((error) => toast(errorText(error), "err"));
        },
        onShortcut: (event) => {
          if (event.altKey) return false;
          const key = event.key.toLowerCase();
          let action = SHORTCUTS[key];
          if (!action) return false;
          if (event.shiftKey) {
            if (key !== "z") return false;
            action = "redo";
          }
          adb.log(`[mirror] shortcut ${action}`, "info");
          engine.sendShortcut(action, event.shiftKey).catch((error) => toast(errorText(error), "err"));
          return true;
        },
        onEmptyEnter: () => {
          pressKey(adb, "enter").catch(() => {});
        },
        onEmptyBackspace: () => {
          pressKey(adb, "del").catch(() => {});
        },
        onKey: (action, keyCode, metaState, repeat) =>
          engine.keyEvent(action, keyCode, metaState, repeat).catch((error) => {
            toast(errorText(error), "err");
          }),
        onModeChange: (textMode) => {
          adb.log(`[mirror] keyboard mode: ${textMode ? "text" : "keys"}`, "info");
        },
      });
      adb.log("[mirror] mouse controls: wheel = precise scroll · left = tap / long-press drag · middle = recents · right = long press · back/forward = back/home · keyboard: keys mode by default, F2 for text/IME", "info");
    } catch (error) {
      adb.log(`[mirror] scrcpy failed: ${errorText(error)}`, "warn");
      try {
        session?.input?.dispose();
      } catch {
        /* ignore */
      }
      try {
        session?.keyboard?.dispose();
      } catch {
        /* ignore */
      }
      try {
        (session?.audio ?? audio)?.close();
      } catch {
        /* ignore */
      }
      try {
        (session?.engine ?? engine)?.stop();
      } catch {
        /* ignore */
      }
      session?.float?.close();
      session = null;
      notify();
      toast(errorText(error), "err", 6000);
    } finally {
      starting = false;
    }
  }

  adb.onConnectionChange((info) => {
    if (!info) stop();
  });

  return {
    start,
    stop,
    toggle() {
      if (session) stop();
      else void start();
    },
    get active() {
      return Boolean(session);
    },
  };
}
