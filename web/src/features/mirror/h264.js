/** Minimal Annex-B H.264 helpers (kept free of DOM APIs for unit tests). */

function startCodeAt(buffer, index) {
  if (index + 4 <= buffer.length && buffer[index] === 0 && buffer[index + 1] === 0 && buffer[index + 2] === 0 && buffer[index + 3] === 1) {
    return { start: index, content: index + 4 };
  }
  if (index + 3 <= buffer.length && buffer[index] === 0 && buffer[index + 1] === 0 && buffer[index + 2] === 1) {
    return { start: index, content: index + 3 };
  }
  return null;
}

function findStart(buffer, from) {
  for (let index = from; index + 3 <= buffer.length; index += 1) {
    const found = startCodeAt(buffer, index);
    if (found) return found;
  }
  return null;
}

/** Split a byte stream into NAL units (without start codes). */
export class AnnexBParser {
  #buffer = new Uint8Array(0);
  #onNal;

  constructor(onNal) {
    this.#onNal = onNal;
  }

  push(chunk) {
    const merged = new Uint8Array(this.#buffer.length + chunk.length);
    merged.set(this.#buffer, 0);
    merged.set(chunk, this.#buffer.length);

    let current = findStart(merged, 0);
    if (!current) {
      this.#buffer = merged.subarray(Math.max(0, merged.length - 3));
      return;
    }

    for (;;) {
      const next = findStart(merged, current.content);
      if (!next) {
        this.#buffer = merged.subarray(current.start);
        return;
      }
      const nal = merged.subarray(current.content, next.start);
      if (nal.length) this.#onNal(nal);
      current = next;
    }
  }
}

/** Codec string for a sequence parameter set NAL (type 7). */
export function codecFromSps(nal) {
  if (!nal || nal.length < 4 || (nal[0] & 0x1f) !== 7) return null;
  const hex = (value) => value.toString(16).padStart(2, "0");
  return `avc1.${hex(nal[1])}${hex(nal[2])}${hex(nal[3])}`;
}
