/**
 * Play scrcpy's Opus audio stream through the computer's default output.
 *
 * The AudioContext must be created during the "Screen Cast" click gesture, so
 * `createAudioPlayer` is called synchronously by the mirror service before it
 * waits for the device.
 */
export function createAudioPlayer({ onError = () => {}, onFrame = () => {} } = {}) {
  let context = null;
  let decoder = null;
  let reader = null;
  let nextAt = 0;
  let firstFrame = true;
  let stopped = false;

  try {
    context = new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    context = null;
  }

  const schedule = (frame) => {
    if (stopped || !context || context.state !== "running") {
      frame.close();
      return;
    }
    const earliest = context.currentTime + 0.06;
    if (nextAt > context.currentTime + 0.5) {
      frame.close();
      return;
    }
    const channels = frame.numberOfChannels;
    const buffer = context.createBuffer(channels, frame.numberOfFrames, frame.sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = new Float32Array(frame.numberOfFrames);
      frame.copyTo(samples, { planeIndex: channel, format: "f32-planar" });
      buffer.copyToChannel(samples, channel);
    }
    frame.close();
    const startAt = Math.max(nextAt, earliest);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(startAt);
    nextAt = startAt + buffer.duration;
    if (firstFrame) {
      firstFrame = false;
      onFrame();
    }
  };

  return {
    resume() {
      if (context?.state === "suspended") context.resume().catch(() => {});
    },
    async start(codec, stream) {
      if (stopped) {
        try {
          await stream.cancel?.();
        } catch {
          /* ignore */
        }
        return;
      }
      if (!context || !("AudioDecoder" in window)) {
        try {
          await stream.cancel?.();
        } catch {
          /* ignore */
        }
        throw new Error(
          !context ? "This browser does not support AudioContext" : "This browser does not support AudioDecoder",
        );
      }
      if (context.state === "suspended") void context.resume().catch(() => {});
      reader = stream.getReader();
      decoder = new AudioDecoder({
        output: schedule,
        error: (error) => {
          if (!stopped) onError(error);
        },
      });
      decoder.configure({
        codec: codec?.webCodecId || "opus",
        sampleRate: 48000,
        numberOfChannels: 2,
      });
      for (;;) {
        const { done, value } = await reader.read();
        if (done || stopped) break;
        if (value.type === "configuration") continue;
        decoder.decode(
          new EncodedAudioChunk({
            type: "key",
            timestamp: Number(value.pts ?? 0),
            data: value.data,
          }),
        );
      }
    },
    close() {
      if (stopped) return;
      stopped = true;
      try {
        if (reader) reader.cancel().catch(() => {});
      } catch {
        /* ignore */
      }
      try {
        decoder?.close();
      } catch {
        /* ignore */
      }
      decoder = null;
      try {
        if (context) context.close().catch(() => {});
      } catch {
        /* ignore */
      }
      context = null;
    },
  };
}
