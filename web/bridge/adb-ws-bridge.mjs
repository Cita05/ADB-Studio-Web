#!/usr/bin/env node
/**
 * ADB Studio — WebSocket ↔ TCP bridge
 *
 * Browsers cannot open raw TCP sockets, so Wi-Fi ADB needs a tiny relay:
 * one WebSocket connection maps to one TCP connection.
 *
 *   node bridge/adb-ws-bridge.mjs --port 7331
 *
 * Then in ADB Studio: Wi-Fi → phone IP + 5555 + bridge port 7331.
 * No dependencies, binds to 127.0.0.1 by default.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import net from "node:net";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function parseArgs(argv) {
  const options = { port: 7331, host: "127.0.0.1" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--port" || arg === "-p") && argv[i + 1]) options.port = Number(argv[++i]);
    else if (arg === "--host" && argv[i + 1]) options.host = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node bridge/adb-ws-bridge.mjs [--port 7331] [--host 127.0.0.1]");
      process.exit(0);
    }
  }
  return options;
}

function wsFrame(data) {
  const length = data.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x82, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, data]);
}

function closeFrame(code = 1000, reason = "") {
  const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
  payload.writeUInt16BE(code, 0);
  payload.write(reason, 2);
  return Buffer.concat([Buffer.from([0x88, payload.length]), payload]);
}

/** Minimal RFC6455 decoder. Returns [consumed, opcode, payload] tuples. */
function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }
    let mask = null;
    if (masked) {
      if (cursor + 4 > buffer.length) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if (cursor + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];
    }
    frames.push({ fin, opcode, payload });
    offset = cursor + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function acceptWebSocket(request, socket, head) {
  const parsed = new URL(request.url ?? "/", "http://localhost");
  const host = parsed.searchParams.get("host");
  const port = Number(parsed.searchParams.get("port") ?? 5555);
  const key = request.headers["sec-websocket-key"];
  if (!key || !host || !Number.isFinite(port)) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  const log = (message) => console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  log(`bridge ${host}:${port} ← WebSocket`);

  const tcp = net.connect({ host, port });
  tcp.setNoDelay(true);
  let buffer = Buffer.alloc(0);
  let closed = false;

  const shutdown = (code, reason) => {
    if (closed) return;
    closed = true;
    try {
      socket.write(closeFrame(code, reason));
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      socket.destroy();
      tcp.destroy();
    }, 50);
    log(`closed ${host}:${port}`);
  };

  tcp.on("connect", () => log(`tcp connected ${host}:${port}`));
  tcp.on("data", (chunk) => {
    if (!socket.writable) return;
    socket.write(wsFrame(chunk));
  });
  tcp.on("error", (error) => {
    log(`tcp error: ${error.message}`);
    shutdown(1011, error.message);
  });
  tcp.on("close", () => shutdown(1000, "tcp closed"));

  socket.on("data", (chunk) => {
    handleBytes(chunk);
  });

  function handleBytes(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      if (frame.opcode === 0x8) {
        shutdown(1000, "client closed");
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]));
        continue;
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x2 || frame.opcode === 0x0) {
        if (frame.fin && frame.payload.length) tcp.write(frame.payload);
      }
    }
  }

  // Bytes that arrived in the same packet as the HTTP upgrade request.
  if (head && head.length) handleBytes(head);

  socket.on("error", () => shutdown(1011, "websocket error"));
  socket.on("close", () => {
    closed = true;
    tcp.destroy();
    log(`websocket closed (${host}:${port})`);
  });
}

const options = parseArgs(process.argv);
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end(
    "ADB Studio WebSocket bridge is running.\n" +
      `Connect from the extension with ws://127.0.0.1:${options.port}/?host=<phone-ip>&port=5555\n`,
  );
});

server.on("upgrade", (request, socket, head) => {
  acceptWebSocket(request, socket, head);
});

server.on("error", (error) => {
  console.error(`bridge error: ${error.message}`);
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${options.port} is busy. Pick another one: --port 7332`);
  }
  process.exit(1);
});

server.listen(options.port, options.host, () => {
  console.log("ADB Studio bridge");
  console.log(`  listening on ws://${options.host}:${options.port}`);
  console.log("  usage: Wi-Fi dialog → phone IP + port 5555 + this bridge port");
  console.log("  stop with Ctrl+C");
});
