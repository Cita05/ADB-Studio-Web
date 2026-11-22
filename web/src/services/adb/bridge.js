import { AdbPacketSerializeStream } from "@yume-chan/adb";
import { ReadableStream as YReadableStream } from "@yume-chan/stream-extra";

const ADB_HEADER_SIZE = 24;

/**
 * Turn a raw ADB byte stream from a WebSocket (relayed by
 * bridge/adb-ws-bridge.mjs) into the packet stream AdbDaemonTransport expects.
 */
export function connectionFromWebSocket(ws) {
  let pending = new Uint8Array(0);

  const readable = new YReadableStream({
    start(controller) {
      ws.binaryType = "arraybuffer";

      ws.onmessage = (event) => {
        if (typeof event.data === "string") return;
        const chunk = new Uint8Array(event.data);
        const merged = new Uint8Array(pending.length + chunk.length);
        merged.set(pending, 0);
        merged.set(chunk, pending.length);
        pending = merged;

        while (pending.length >= ADB_HEADER_SIZE) {
          const view = new DataView(pending.buffer, pending.byteOffset, ADB_HEADER_SIZE);
          const payloadLength = view.getUint32(12, true);
          if (pending.length < ADB_HEADER_SIZE + payloadLength) return;
          controller.enqueue({
            command: view.getUint32(0, true),
            arg0: view.getUint32(4, true),
            arg1: view.getUint32(8, true),
            payload: pending.slice(ADB_HEADER_SIZE, ADB_HEADER_SIZE + payloadLength),
          });
          pending = pending.slice(ADB_HEADER_SIZE + payloadLength);
        }
      };

      ws.onclose = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      ws.onerror = () => {
        try {
          controller.error(new Error("WebSocket bridge connection failed"));
        } catch {
          /* already errored */
        }
      };
    },
    cancel() {
      ws.close();
    },
  });

  const serialized = new AdbPacketSerializeStream();
  void serialized.readable
    .pipeTo(
      new WritableStream({
        write(chunk) {
          return chunk.tryConsume((value) => {
            if (ws.readyState !== WebSocket.OPEN) throw new Error("Bridge socket closed");
            ws.send(value);
          });
        },
      }),
    )
    .catch(() => {});

  return { readable, writable: serialized.writable };
}

export function openWebSocket(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url);
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    const timer = window.setTimeout(() => {
      settle(() => {
        ws.close();
        reject(new Error("Bridge did not respond. Is bridge/adb-ws-bridge.mjs running?"));
      });
    }, timeoutMs);
    ws.onopen = () => settle(() => resolve(ws));
    ws.onerror = () => settle(() => reject(new Error("Bridge not reachable on 127.0.0.1")));
  });
}
