// Aggregates the vanilla node:test suites. Running this file directly keeps
// `pnpm test` working in restricted shells where the `node --test` runner
// cannot spawn child processes.
import "./mirror-gestures.test.js";
import "./mirror-input.test.js";
import "./mirror-keyboard.test.js";
import "./mirror-keymap.test.js";
import "./mirror-options.test.js";
import "./adb-bridge.test.js";
import "./audio-player.test.js";
