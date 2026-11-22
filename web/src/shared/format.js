export function fmtBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return "—";
    if (bytes < 1024)
        return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}
const pad = (n) => String(n).padStart(2, "0");
export function fmtClock(d = new Date()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function fmtDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return iso;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** Remove ANSI/terminal control sequences from device output. */
export function stripAnsi(text) {
    return String(text ?? "")
        .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\x1b[@-Z\\-_]/g, "")
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
        .replace(/\r/g, "");
}
export function debounce(fn, wait = 180) {
    let timer;
    return ((...args) => {
        if (timer)
            window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), wait);
    });
}
/** Split a command line respecting simple double/single quotes (adb style). */
export function splitArgs(line) {
    const out = [];
    let cur = "";
    let quote = null;
    for (const ch of line) {
        if (quote) {
            if (ch === quote)
                quote = null;
            else
                cur += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (/\s/.test(ch)) {
            if (cur) {
                out.push(cur);
                cur = "";
            }
            continue;
        }
        cur += ch;
    }
    if (cur)
        out.push(cur);
    return out;
}
