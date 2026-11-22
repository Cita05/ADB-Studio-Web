import assert from "node:assert/strict";
import test from "node:test";
import { createScrcpyOptions } from "../src/features/mirror/scrcpy-streamer.js";

test("video defaults stay, and the device is kept awake", () => {
  const args = createScrcpyOptions().serialize();
  assert.ok(args.includes("stay_awake=true"));
  assert.ok(!args.some((line) => /^(video_bit_rate|max_fps|max_size)=/.test(line)));
});
