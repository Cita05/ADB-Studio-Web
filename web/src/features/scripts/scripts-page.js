import { PALETTE } from "./palette.js";
import { loadScripts, saveScripts, upsertScript } from "./script-store.js";
import { openCoordPicker as openPicker } from "./coord-picker.js";
import { button, card, confirmDialog, el, icon, toast } from "../../shared/dom.js";
import { delay } from "../../shared/async.js";
import { errorText } from "../../shared/errors.js";
import { pickFile, saveBlob } from "../../shared/fs.js";
import { pageHeader } from "../../app/page-kit.js";
export function createScriptPage(ctx) {
    let body = null;
    let content = "";
    let scriptName = "";
    let saved = loadScripts();
    let hintText = "";
    let running = false;
    let status = "";
    const adb = ctx.adb;
    function textareaEl() {
        return body?.querySelector(".script-editor textarea") ?? null;
    }
    function insertAtCaret(text) {
        const area = textareaEl();
        if (!area)
            return;
        const start = area.selectionStart ?? content.length;
        const end = area.selectionEnd ?? start;
        content = content.slice(0, start) + text + content.slice(end);
        area.value = content;
        const nextCaret = start + text.length;
        area.focus();
        area.setSelectionRange(nextCaret, nextCaret);
    }
    async function saveCurrent() {
        const name = scriptName.trim();
        const text = content.trim();
        if (!name || !text) {
            toast("Script name and content cannot be empty", "warn");
            return;
        }
        saved = upsertScript(saved, { name, content: text });
        saveScripts(saved);
        adb.log(`Script saved: ${name}`, "ok");
        toast("Script saved", "ok");
        paint();
    }
    async function runScript() {
        if (running) {
            toast("Script is already running, please stop first", "warn");
            return;
        }
        if (!adb.connected) {
            toast("Connect a device first", "warn");
            return;
        }
        const lines = content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));
        if (!lines.length)
            return;
        running = true;
        const startedAt = Date.now();
        status = `Starting script (${lines.length} commands)...`;
        paint();
        adb.log(status, "ok");
        for (let index = 0; index < lines.length; index += 1) {
            if (!running) {
                adb.log("Script stopped", "warn");
                break;
            }
            const line = lines[index];
            status = `[${index + 1}/${lines.length}] $ ${line}`;
            paint();
            if (line.startsWith("sleep ")) {
                const seconds = Number.parseFloat(line.split(/\s+/)[1] ?? "");
                if (Number.isFinite(seconds)) {
                    adb.log(`[${index + 1}/${lines.length}] Waiting ${seconds} seconds...`, "info");
                    const until = Date.now() + seconds * 1000;
                    while (running && Date.now() < until) {
                        await delay(Math.min(120, until - Date.now()));
                    }
                }
                continue;
            }
            await adb.runAdbLine(line);
        }
        if (running) {
            adb.log("Script completed", "ok");
            status = `Finished in ${Date.now() - startedAt} ms`;
        }
        else {
            status = "Script stopped";
        }
        running = false;
        paint();
    }
    function stopScript() {
        if (!running) {
            toast("Script is not running", "warn");
            return;
        }
        running = false;
        adb.log("Stopping script...", "warn");
        status = "Script stopped";
        paint();
    }
    function openCoordPicker() {
        if (!adb.connected) {
            toast("Connect a device first", "warn");
            return;
        }
        void openPicker({
            adb,
            onInsert: (coordinates) => insertAtCaret(coordinates),
            onError: (message) => toast(message, "err"),
        });
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("Script Management", "Scripts"));
        const area = el("textarea", {
            class: "textarea",
            spellcheck: "false",
            style: "min-height:340px;font-size:13.5px",
            placeholder: "shell input keyevent 3\nsleep 1\nshell input tap 540 1200",
        });
        area.value = content;
        area.addEventListener("input", () => {
            content = area.value;
        });
        const nameInput = el("input", {
            class: "input",
            value: scriptName,
            placeholder: "my_script",
        });
        nameInput.addEventListener("input", () => (scriptName = nameInput.value));
        const editorCard = card("Script Editor", el("div", { class: "stack script-editor" }, el("div", { class: "row" }, el("span", { class: "muted small" }, "Script Name:"), el("div", { class: "grow" }, nameInput)), area, el("div", { class: "row" }, button("Save", { variant: "primary", icon: "save", small: true, onClick: () => void saveCurrent() }), button("Run", { icon: "play", small: true, disabled: running, onClick: () => void runScript() }), button("Stop", { icon: "stop", small: true, disabled: !running, onClick: () => stopScript() }), button("Get Coordinates", { icon: "camera", small: true, onClick: () => void openCoordPicker() }), el("div", { class: "grow" }), button("Clear", { icon: "trash", small: true, onClick: () => {
                content = "";
                scriptName = "";
                paint();
            } })), status ? el("div", { class: "hint" }, status) : null), { icon: "script", sub: running ? "Script is running..." : undefined });
        const listCard = card("Saved Scripts", el("div", { class: "stack" }, el("div", { class: "row tight" }, button("New", { icon: "plus", small: true, onClick: () => {
                content = "";
                scriptName = "";
                paint();
            } }), button("Import", {
            icon: "upload",
            small: true,
            onClick: async () => {
                const file = await pickFile(".json,application/json");
                if (!file)
                    return;
                try {
                    const parsed = JSON.parse(await file.text());
                    const items = Array.isArray(parsed) ? parsed : [parsed];
                    for (const item of items) {
                        if (item?.name && typeof item.content === "string") {
                            saved = [...saved.filter((s) => s.name !== item.name), { name: item.name, content: item.content }];
                        }
                    }
                    saveScripts(saved);
                    paint();
                    toast("Success", "ok");
                }
                catch (error) {
                    toast(errorText(error), "err");
                }
            },
        }), button("Export", {
            icon: "download",
            small: true,
            onClick: async () => {
                await saveBlob(new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }), "adb-studio-scripts.json", "JSON");
            },
        })), saved.length
            ? el("div", { class: "list" }, ...saved.map((item) => el("div", { class: "list-item" }, icon("script", 15), el("span", { class: "name grow" }, item.name), el("button", {
                class: "btn small ghost",
                title: "Copy",
                onclick: () => {
                    content = item.content;
                    scriptName = item.name;
                    paint();
                },
            }, "Load"), el("button", {
                class: "btn small danger",
                title: "Delete",
                onclick: async () => {
                    if (!(await confirmDialog(`Delete script “${item.name}”?`, { danger: true })))
                        return;
                    saved = saved.filter((s) => s.name !== item.name);
                    saveScripts(saved);
                    paint();
                },
            }, icon("trash", 13)))))
            : el("div", { class: "muted small", style: "padding:8px 2px" }, "No saved scripts yet.")), { icon: "folder" });
        const hintCard = card("Hint", el("div", { class: "muted small", style: "white-space:pre-wrap;line-height:1.7" }, hintText || "Click a button for hints..."), {
            icon: "info",
        });
        const paletteCard = card("Button Palette", el("div", { class: "stack" }, ...PALETTE.map((category) => el("div", null, el("div", { class: "muted small", style: "font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:10px;margin-bottom:6px" }, category.category), el("div", { class: "row tight" }, ...category.buttons.map((btn) => el("button", {
            class: "chip",
            title: btn.hint,
            onclick: () => {
                insertAtCaret(`\n${btn.template}`);
                hintText = btn.hint;
                paint();
            },
        }, btn.name)))))), { icon: "sliders" });
        body.append(el("div", { class: "grid sidebar-right" }, el("div", { class: "stack" }, editorCard), el("div", { class: "stack" }, listCard, hintCard, paletteCard)));
    }
    return {
        id: "script",
        icon: "script",
        label: "Scripts",
        section: "tools",
        render(root) {
            body = root;
            paint();
        },
        onShow() {
            if (body && !body.firstChild)
                paint();
        },
    };
}
