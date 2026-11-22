/** Convert bytes to a data URL (used for lazily loaded app icons). */
export function bytesToDataUrl(bytes, type = "image/png") {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(new Blob([bytes], { type }));
    });
}

/** Save a blob to disk, using the File System Access API when available. */
export async function saveBlob(blob, filename, description = "File", accept = "") {
    const picker = window.showSaveFilePicker;
    if (picker) {
        try {
            const ext = filename.includes(".") ? `.${filename.split(".").pop()}` : "";
            const handle = await picker({
                suggestedName: filename,
                types: ext
                    ? [
                        {
                            description,
                            accept: { [blob.type || "application/octet-stream"]: accept ? [accept] : [ext] },
                        },
                    ]
                    : undefined,
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return handle.name;
        }
        catch (err) {
            if (err?.name === "AbortError")
                return "";
            /* fall through to download */
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return filename;
}
/** Ask the user for a file. Returns null when cancelled. */
export function pickFile(accept) {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.style.display = "none";
        input.addEventListener("change", () => {
            resolve(input.files?.[0] ?? null);
            input.remove();
        });
        input.addEventListener("cancel", () => {
            resolve(null);
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    });
}
