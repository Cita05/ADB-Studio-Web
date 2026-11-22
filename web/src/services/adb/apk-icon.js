/** Extract a launcher icon from an installed APK without pulling the whole file.
 *  Reads the ZIP central directory via `tail`, then only the icon entry via `dd`.
 *  Falls back to `null` for adaptive/vector-only icons.
 */
import { bytesToDataUrl } from "../../shared/fs.js";
import { packagePaths } from "./streams.js";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

const u16 = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8);
const u32 = (buffer, offset) => (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;

const findEocd = (buffer) => {
    for (let index = buffer.length - 22; index >= 0; index -= 1) {
        if (u32(buffer, index) === EOCD)
            return index;
    }
    return -1;
};

const inflateRaw = async (bytes) => {
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    catch {
        return null;
    }
};

export async function iconFromApk(controller, pkg) {
    const { stdout: pathOutput } = await controller.shell(`pm path ${pkg}`, 10000);
    const paths = packagePaths(pathOutput);
    const apk = paths.find((path) => path.endsWith("base.apk")) ?? paths[0];
    if (!apk)
        return null;

    const { stdout: sizeOutput } = await controller.shell(`wc -c < "${apk}"`, 5000);
    const size = Number(sizeOutput.trim());
    if (!Number.isFinite(size) || size <= 0)
        return null;

    const tailSize = Math.min(size, 1024 * 1024);
    const tail = await controller.execOut(`tail -c ${tailSize} "${apk}"`, 15000);
    const eocd = findEocd(tail);
    if (eocd < 0)
        return null;

    const centralSize = u32(tail, eocd + 12);
    const centralOffset = u32(tail, eocd + 16);
    const centralStart = centralOffset - (size - tail.length);
    if (centralStart < 0 || centralStart + centralSize > eocd)
        return null;

    const entries = [];
    let position = centralStart;
    while (position + 46 <= eocd && u32(tail, position) === CENTRAL) {
        const method = u16(tail, position + 10);
        const compressedSize = u32(tail, position + 20);
        const nameLength = u16(tail, position + 28);
        const extraLength = u16(tail, position + 30);
        const commentLength = u16(tail, position + 32);
        const localOffset = u32(tail, position + 42);
        const name = new TextDecoder().decode(tail.subarray(position + 46, position + 46 + nameLength));
        // Skip adaptive-icon layers (foreground/background/monochrome): those are
        // transparent layers, not the composed icon users see on the launcher.
        if (/\.(png|webp)$/i.test(name) && /(ic_launcher|icon)/i.test(name) && !/(foreground|background|monochrome)/i.test(name))
            entries.push({ name, method, compressedSize, localOffset });
        position += 46 + nameLength + extraLength + commentLength;
    }
    if (!entries.length)
        return null;

    entries.sort((a, b) =>
        (Number(/ic_launcher/i.test(b.name)) - Number(/ic_launcher/i.test(a.name))) ||
        (b.compressedSize - a.compressedSize));
    const entry = entries[0];
    const header = await controller.execOut(`dd if="${apk}" bs=1 skip=${entry.localOffset} count=30 2>/dev/null`, 10000);
    if (header.length < 30)
        return null;
    const dataOffset = entry.localOffset + 30 + u16(header, 26) + u16(header, 28);
    const raw = await controller.execOut(`dd if="${apk}" bs=1 skip=${dataOffset} count=${entry.compressedSize} 2>/dev/null`, 20000);
    if (raw.length < entry.compressedSize)
        return null;
    const bytes = entry.method === 0 ? raw : await inflateRaw(raw);
    if (!bytes?.length)
        return null;
    return bytesToDataUrl(bytes, entry.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png");
}
