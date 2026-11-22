import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createAudioPlayer } from "../src/features/mirror/audio-player.js";

const savedGlobals = {
  AudioContext: globalThis.AudioContext,
  AudioDecoder: globalThis.AudioDecoder,
  EncodedAudioChunk: globalThis.EncodedAudioChunk,
  window: globalThis.window,
};

after(() => {
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "running";
    this.currentTime = 1;
    this.destination = {};
    this.scheduled = [];
    FakeAudioContext.instances.push(this);
  }

  createBuffer(channels, frames, sampleRate) {
    return {
      duration: frames / sampleRate,
      copyToChannel() {},
    };
  }

  createBufferSource() {
    const source = {
      buffer: null,
      connect() {},
      start: (at) => this.scheduled.push({ at, buffer: source.buffer }),
    };
    return source;
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

class FakeAudioDecoder {
  static instances = [];

  constructor(init) {
    this.init = init;
    this.chunks = [];
    FakeAudioDecoder.instances.push(this);
  }

  configure(config) {
    this.config = config;
  }

  decode(chunk) {
    this.chunks.push(chunk);
    this.init.output({
      numberOfChannels: 2,
      numberOfFrames: 480,
      sampleRate: 48_000,
      copyTo(destination) {
        destination.fill(0.25);
      },
      close() {},
    });
  }

  close() {
    this.closed = true;
  }
}

class FakeEncodedAudioChunk {
  constructor(init) {
    Object.assign(this, init);
  }
}

function fakeStream(packets) {
  const state = { cancelled: false, index: 0 };
  const reader = {
    async read() {
      if (state.index >= packets.length) return { done: true };
      return { done: false, value: packets[state.index++] };
    },
    async cancel() {
      state.cancelled = true;
    },
  };
  state.getReader = () => reader;
  return state;
}

test("audio player decodes Opus packets and schedules them", async () => {
  globalThis.window = globalThis;
  globalThis.AudioContext = FakeAudioContext;
  globalThis.AudioDecoder = FakeAudioDecoder;
  globalThis.EncodedAudioChunk = FakeEncodedAudioChunk;

  let frameCalls = 0;
  const player = createAudioPlayer({ onFrame: () => (frameCalls += 1) });
  const stream = fakeStream([
    { type: "configuration", data: new Uint8Array([1]) },
    { type: "data", pts: 5000n, data: new Uint8Array([2, 3]) },
  ]);

  await player.start({ webCodecId: "opus" }, stream);

  const context = FakeAudioContext.instances.at(-1);
  const decoder = FakeAudioDecoder.instances.at(-1);
  assert.equal(decoder.config.codec, "opus");
  assert.equal(decoder.config.sampleRate, 48_000);
  assert.equal(decoder.config.numberOfChannels, 2);
  assert.equal(decoder.chunks.length, 1);
  assert.equal(decoder.chunks[0].timestamp, 5000);
  assert.equal(context.scheduled.length, 1);
  assert.ok(context.scheduled[0].at >= context.currentTime);
  assert.equal(context.scheduled[0].buffer.duration, 0.01);
  assert.equal(frameCalls, 1);

  player.close();
  assert.equal(context.state, "closed");
  assert.equal(decoder.closed, true);
});
