/** Byte-stream helpers for ADB shell / sync output. */

export const bytesToBlob = (bytes, type) => new Blob([new Uint8Array(bytes)], { type });

export const decode = (bytes) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

export const isPng = (bytes) =>
  bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

export const concatBytes = (...parts) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export const packagePaths = (stdout) => stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("package:"))
  .map((line) => line.slice(8).trim())
  .filter(Boolean);

/**
 * Read a stream into one Uint8Array, with a hard cap so a misbehaving command
 * cannot exhaust memory.
 * @param {ReadableStream<Uint8Array>} readable
 * @param {number} cap
 */
export async function collect(readable, cap = 8 * 1024 * 1024) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > cap) {
      const room = Math.max(0, cap - total);
      if (room > 0) {
        chunks.push(value.subarray(0, room));
        total += room;
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  reader.releaseLock?.();
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
