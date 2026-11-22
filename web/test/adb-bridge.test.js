import assert from "node:assert/strict";
import test from "node:test";
import { Consumable } from "@yume-chan/stream-extra";
import { connectionFromWebSocket } from "../src/services/adb/bridge.js";

test("bridge serializes ADB packets from the WebSocket transport", async () => {
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = { OPEN: 1 };
  try {
    const sent = [];
    const ws = {
      readyState: 1,
      binaryType: "",
      send: (chunk) => sent.push(chunk),
      close() {},
    };
    const { writable } = connectionFromWebSocket(ws);
    const writer = writable.getWriter();
    await writer.write(
      new Consumable({
        command: 0x4e584e43,
        arg0: 0x01000001,
        arg1: 4096,
        payloadLength: 0,
        checksum: 0,
        magic: 0,
        payload: new Uint8Array(0),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(sent.length, 1);
    assert.equal(sent[0].length, 24);
    assert.equal(new DataView(sent[0].buffer).getUint32(0, true), 0x4e584e43);
    await writer.close();
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
  }
});
