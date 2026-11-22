import { AdbScrcpyClient, AdbScrcpyOptions5_0_1 } from "@yume-chan/adb-scrcpy";
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  DefaultServerPath,
  ScrcpyControlMessageType,
  ScrcpyPointerId,
  ScrcpySetClipboardControlMessage,
} from "@yume-chan/scrcpy";
import { errorText } from "../../shared/errors.js";
import { concatBytes } from "../../services/adb/streams.js";
import { AnnexBParser, codecFromSps } from "./h264.js";

const SHORTCUT_KEYS = {
  selectAll: AndroidKeyCode.KeyA,
  copy: AndroidKeyCode.KeyC,
  cut: AndroidKeyCode.KeyX,
  paste: AndroidKeyCode.KeyV,
  undo: AndroidKeyCode.KeyZ,
  redo: AndroidKeyCode.KeyY,
};

const TOUCH_ACTIONS = {
  down: AndroidMotionEventAction.Down,
  move: AndroidMotionEventAction.Move,
  up: AndroidMotionEventAction.Up,
};

/** scrcpy options shared by the streamer and option tests. */
export function createScrcpyOptions() {
  return new AdbScrcpyOptions5_0_1({
    video: true,
    audio: true,
    audioCodec: "opus",
    audioSource: "output",
    control: true,
    videoCodec: "h264",
    cleanup: true,
    powerOn: true,
    stayAwake: true,
    clipboardAutosync: false,
    logLevel: "info",
  });
}

const hasAnnexBStartCode = (data) =>
  data.length >= 4 &&
  ((data[0] === 0 && data[1] === 0 && data[2] === 1) ||
    (data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1));

/** Parse SPS profile/level out of an Annex-B configuration blob. */
function codecFromAnnexB(config) {
  if (!config?.length) return null;
  let sps = null;
  const parser = new AnnexBParser((nal) => {
    if ((nal[0] & 0x1f) === 7) sps = nal;
  });
  parser.push(config);
  parser.push(new Uint8Array([0, 0, 0, 1]));
  if (!sps && (config[0] & 0x1f) === 7) sps = config;
  return sps ? codecFromSps(sps) : null;
}

/** avcC box: [0]=1, [1]=profile, [2]=compatibility, [3]=level. */
function codecFromAvcC(config) {
  if (!config || config.length < 7 || config[0] !== 1) return null;
  const hex = (value) => value.toString(16).padStart(2, "0");
  return `avc1.${hex(config[1])}${hex(config[2])}${hex(config[3])}`;
}

/**
 * scrcpy engine: pushes the bundled scrcpy-server (5.0.1), receives the same
 * H.264 stream as the desktop scrcpy client and decodes it with WebCodecs.
 */
export function createScrcpyStreamer({ controller, canvas, audio = null, onFallback }) {
  const context = canvas.getContext("2d", { alpha: false });
  let stopped = false;
  let fallbackCalled = false;
  let client = null;
  let reader = null;
  let decoder = null;
  let configured = false;
  let configData = null;
  let configFormat = "annexb";
  let timestamp = 0;
  let width = 0;
  let height = 0;
  let firstFrameLogged = false;
  let touchQueue = Promise.resolve();
  let keyQueue = Promise.resolve();

  const cleanup = async () => {
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
    reader = null;
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    client = null;
    try {
      decoder?.close();
    } catch {
      /* ignore */
    }
    decoder = null;
  };

  const fail = (error) => {
    if (stopped || fallbackCalled) return;
    fallbackCalled = true;
    stopped = true;
    void cleanup();
    onFallback?.(error);
  };

  const createDecoder = () => {
    if (decoder) return;
    decoder = new VideoDecoder({
      output(frame) {
        if (stopped) {
          frame.close();
          return;
        }
        if (width !== frame.displayWidth || height !== frame.displayHeight) {
          width = frame.displayWidth;
          height = frame.displayHeight;
          canvas.width = width;
          canvas.height = height;
        }
        try {
          context.drawImage(frame, 0, 0);
        } finally {
          frame.close();
        }
        if (!firstFrameLogged) {
          firstFrameLogged = true;
          controller.log(`[mirror] scrcpy first frame ${width}×${height}`, "ok");
          try {
            const sample = context.getImageData(Math.max(0, Math.floor(width / 2) - 2), Math.max(0, Math.floor(height / 2) - 2), 4, 4).data;
            let sum = 0;
            for (let index = 0; index < sample.length; index += 4) sum += sample[index] + sample[index + 1] + sample[index + 2];
            if (sum < 6) controller.log("[mirror] scrcpy first frame is black", "warn");
          } catch {
            /* diagnostic only */
          }
        }
      },
      error(error) {
        fail(error);
      },
    });
  };

  const configureDecoder = () => {
    const format = configData && !hasAnnexBStartCode(configData) ? "avcc" : "annexb";
    configFormat = format;
    const codec = format === "avcc" ? (codecFromAvcC(configData) ?? "avc1.42E01E") : (codecFromAnnexB(configData) ?? "avc1.42E01E");
    const config = { codec, optimizeForLatency: true };
    if (format === "annexb") {
      config.avc = { format: "annexb" };
    } else if (configData) {
      config.description = configData;
    }
    decoder.configure(config);
    configured = true;
  };

  const pump = async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          if (!stopped) fail(new Error("scrcpy video stream ended"));
          return;
        }
        if (stopped) return;

        if (value.type === "configuration") {
          configData = value.data;
          if (configured) {
            try {
              decoder?.close();
            } catch {
              /* ignore */
            }
            decoder = null;
            configured = false;
          }
          continue;
        }

        if (value.type === "session") {
          if (value.width && value.height) {
            width = value.width;
            height = value.height;
            canvas.width = width;
            canvas.height = height;
          }
          continue;
        }

        if (!value.keyframe && !configured) continue;
        createDecoder();
        if (!configured) {
          try {
            configureDecoder();
          } catch (error) {
            fail(error);
            return;
          }
        }

        const data =
          configFormat === "annexb" && value.keyframe && configData
            ? concatBytes(configData, value.data)
            : value.data;
        const pts = value.pts != null ? Number(value.pts) : timestamp;
        try {
          decoder.decode(
            new EncodedVideoChunk({
              type: value.keyframe ? "key" : "delta",
              timestamp: pts,
              duration: 33333,
              data,
            }),
          );
          timestamp = pts + 33333;
        } catch (error) {
          fail(error);
          return;
        }
      }
    } catch (error) {
      if (!stopped) fail(error);
    }
  };

  const pushServer = async (adb) => {
    const response = await fetch(new URL("scrcpy-server", location.href));
    if (!response.ok || !response.body) throw new Error("bundled scrcpy-server is missing");
    await AdbScrcpyClient.pushServer(adb, response.body, DefaultServerPath);
  };

  return {
    async start() {
      const adb = controller.raw;
      if (!adb) throw new Error("No ADB connection");
      controller.log("[mirror] pushing scrcpy-server…", "info");
      await pushServer(adb);

      const options = createScrcpyOptions();

      client = await AdbScrcpyClient.start(adb, DefaultServerPath, options);
      const video = await client.videoStream;
      if (!video) throw new Error("scrcpy returned no video stream");
      if (video.metadata?.width && video.metadata?.height) {
        width = video.metadata.width;
        height = video.metadata.height;
        canvas.width = width;
        canvas.height = height;
      }
      reader = video.stream.getReader();
      controller.log(`[mirror] scrcpy stream ready (${video.metadata?.codec ?? "h264"})`, "ok");

      // scrcpy -S equivalent: turn the physical display off after the pipeline
      // is ready, but keep mirroring. The server restores it on cleanup.
      try {
        await client.controller?.setDisplayPower(false);
        controller.log("[mirror] screen off (-S)", "info");
      } catch (error) {
        controller.log(`[mirror] screen off failed: ${errorText(error)}`, "warn");
      }

      void pump();

      const audioMeta = client.audioStream;
      if (!audioMeta) {
        controller.log("[mirror] audio stream not available", "warn");
        audio?.close();
      } else {
        void audioMeta
          .then((metadata) => {
            if (metadata.type !== "success") {
              controller.log(`[mirror] audio ${metadata.type} (Android 11+ required)`, "warn");
              audio?.close();
              return;
            }
            if (stopped || !audio) {
              metadata.stream.cancel?.().catch?.(() => {});
              return;
            }
            controller.log(`[mirror] audio stream ready (${metadata.codec.optionValue})`, "ok");
            void audio.start(metadata.codec, metadata.stream).catch((error) => {
              controller.log(`[mirror] audio playback failed: ${errorText(error)}`, "warn");
              audio.close();
            });
          })
          .catch((error) => {
            controller.log(`[mirror] audio stream failed: ${errorText(error)}`, "warn");
            audio?.close();
          });
      }
    },
    /**
     * Inject text via the scrcpy control channel. ASCII is sent as key events;
     * Unicode (e.g. Chinese from the host IME) goes through the device
     * clipboard, which is the only scrcpy path that supports it.
     */
    async sendText(text) {
      const writer = client?.controller;
      if (!writer) throw new Error("scrcpy control channel is not available");
      if (/^[\x20-\x7E]+$/.test(text)) return writer.injectText(text);
      return writer.write(
        ScrcpySetClipboardControlMessage.serialize({
          type: ScrcpyControlMessageType.SetClipboard,
          sequence: 0n,
          paste: true,
          content: text,
        }),
      );
    },
    /**
     * Inject a real mouse touch sequence. Holding the primary button down lets
     * Android's long-press detector fire before the following MOVE events, so
     * desktop icons and home-screen layouts can be dragged.
     */
    touch(action, x, y, width, height) {
      const writer = client?.controller;
      const androidAction = TOUCH_ACTIONS[action];
      if (!writer || androidAction === undefined) {
        return Promise.reject(new Error("scrcpy control channel is not available"));
      }
      const up = action === "up";
      const message = {
        action: androidAction,
        pointerId: ScrcpyPointerId.Mouse,
        pointerX: x,
        pointerY: y,
        videoWidth: width,
        videoHeight: height,
        pressure: up ? 0 : 1,
        actionButton: action === "move" ? 0 : 1,
        buttons: up ? 0 : 1,
      };
      const run = () => writer.injectTouch(message);
      touchQueue = touchQueue.then(run, run);
      return touchQueue;
    },
    /** Raw key down/up for keys mode (media keys, games, shortcuts). */
    keyEvent(action, keyCode, metaState = 0, repeat = 0) {
      const writer = client?.controller;
      if (!writer) return Promise.reject(new Error("scrcpy control channel is not available"));
      const androidAction = action === "down" ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up;
      const run = () => writer.injectKeyCode({ action: androidAction, keyCode, repeat, metaState });
      keyQueue = keyQueue.then(run, run);
      return keyQueue;
    },
    /** Precise mouse-wheel scroll (ACTION_SCROLL, no fling) like scrcpy. */
    async scroll(x, y, deltaX, deltaY, width, height) {
      const writer = client?.controller;
      if (!writer) throw new Error("scrcpy control channel is not available");
      await writer.injectScroll({
        pointerX: x,
        pointerY: y,
        videoWidth: width,
        videoHeight: height,
        scrollX: deltaX,
        scrollY: deltaY,
        buttons: 0,
      });
    },
    /** Send Ctrl/Ctrl+Shift shortcuts (select all, copy, paste, undo, ...). */
    async sendShortcut(action, shift = false) {
      const writer = client?.controller;
      const keyCode = action === "redo" && shift ? AndroidKeyCode.KeyZ : SHORTCUT_KEYS[action];
      if (!writer || keyCode === undefined) throw new Error("scrcpy control channel is not available");
      const metaState =
        AndroidKeyEventMeta.Ctrl |
        AndroidKeyEventMeta.CtrlLeft |
        (shift ? AndroidKeyEventMeta.Shift | AndroidKeyEventMeta.ShiftLeft : 0);
      await writer.injectKeyCode({ action: AndroidKeyEventAction.Down, keyCode, repeat: 0, metaState });
      await writer.injectKeyCode({ action: AndroidKeyEventAction.Up, keyCode, repeat: 0, metaState });
    },
    stop() {
      stopped = true;
      void cleanup();
    },
  };
}
