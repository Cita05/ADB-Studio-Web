import { AgentRunner } from "../../services/llm/runner.js";
import { createSession, deleteSession, getSession, listSessions, newMessage, putSession, toLlmContext, } from "../../core/session-store.js";
import { button, confirmDialog, el, icon, promptDialog, toast } from "../../shared/dom.js";
import { fmtDateTime } from "../../shared/format.js";
import { settings } from "../../core/settings.js";
import { pageHeader } from "../../app/page-kit.js";
import { createBubble } from "./chat-bubbles.js";
import { openApiSettings } from "./api-settings.js";

export function createAgentPage(ctx) {
    let body = null;
    let sessions = [];
    let session = null;
    let mode = settings.get().agentMode;
    let alwaysExecute = settings.get().alwaysExecute;
    let running = false;
    let stopping = false;
    let streaming = false;
    let runner = null;
    let liveRaw = "";
    let stepNo = 0;
    let pending = null;
    let listEl = null;
    let messagesEl = null;
    let inputEl = null;
    let actionBtn = null;
    const adb = ctx.adb;
    /* ── persistence ────────────────────────────────────────────────────── */
    async function refreshSessions() {
        sessions = await listSessions();
        renderSessions();
    }
    async function ensureSession() {
        if (session)
            return session;
        session = createSession("New Session");
        await putSession(session);
        await refreshSessions();
        return session;
    }
    async function pushMessage(role, content, image) {
        const current = await ensureSession();
        const message = newMessage(role, content, image);
        current.messages.push(message);
        const defaultTitle = "New Session";
        if (role === "user" && current.title === defaultTitle) {
            current.title = content.slice(0, 48) || defaultTitle;
        }
        await putSession(current);
        if (role === "user" || role === "complete" || role === "system")
            await refreshSessions();
        renderMessages();
    }
    /* ── chat rendering ─────────────────────────────────────────────────── */
    function renderMessages() {
        if (!messagesEl)
            return;
        const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 200;
        messagesEl.replaceChildren();
        if (!session || !session.messages.length) {
            messagesEl.appendChild(el("div", { class: "chat-empty" }, icon("sparkles", 36), el("h3", null, "Agent"), el("p", null, "Ask the agent to do something on the phone, e.g. “open Settings and enable Wi-Fi”."), el("div", { class: "chip-row", style: "justify-content:center" }, ...["Show battery info", "Open Settings and turn on Wi-Fi", "Take a screenshot and describe it"].map((text) => el("button", {
                class: "chip",
                onclick: () => {
                    if (inputEl) {
                        inputEl.value = text;
                        inputEl.focus();
                    }
                },
            }, text)))));
        }
        session?.messages.forEach((message, index) => {
            const bubble = createBubble(message.role, message.content, { image: message.image, index, onRollback: (i) => void rollbackTo(i) });
            messagesEl?.appendChild(bubble.root);
        });
        if (running && streaming) {
            const preview = liveRaw;
            const label = mode === "chat" ? "Streaming…" : `Steps ${stepNo || 1}`;
            const live = createBubble("thought", preview || "Thinking...", { live: true });
            live.root.dataset.live = "1";
            const who = live.root.querySelector(".who-label");
            if (who)
                who.textContent = label;
            messagesEl?.appendChild(live.root);
        }
        if (pending) {
            messagesEl?.appendChild(confirmBar());
        }
        paintStatus();
        if (nearBottom || running)
            messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function confirmBar() {
        const bar = el("div", { class: "confirm-bar" }, el("div", { class: "grow" }, el("b", null, "Execute this command?"), el("div", { class: "muted small" }, "Review the command before it runs on the device.")), button("Execute", {
            variant: "primary",
            small: true,
            icon: "check",
            onClick: () => resolveConfirm("execute"),
        }), button("Reject", { small: true, icon: "x", onClick: () => resolveConfirm("reject") }), button("Stop", { variant: "danger", small: true, icon: "stop", onClick: () => resolveConfirm("stop") }));
        return bar;
    }
    function resolveConfirm(decision) {
        const resolve = pending;
        pending = null;
        renderMessages();
        resolve?.(decision);
    }
    function renderSessions() {
        if (!listEl)
            return;
        listEl.replaceChildren();
        const countBadge = body?.querySelector(".session-count");
        if (countBadge)
            countBadge.textContent = String(sessions.length);
        if (!sessions.length) {
            listEl.appendChild(el("div", { class: "muted small", style: "padding:10px" }, "No sessions yet"));
            return;
        }
        for (const item of sessions) {
            const active = session?.session_id === item.session_id;
            const row = el("div", { class: `session-item${active ? " active" : ""}` }, el("div", { class: "session-main" }, el("div", { class: "session-title" }, item.title), el("div", { class: "session-time" }, fmtDateTime(item.updated_at))));
            row.addEventListener("click", () => void openSession(item.session_id));
            const rename = el("button", { class: "msg-action", title: "Rename" }, icon("settings", 12));
            rename.addEventListener("click", async (event) => {
                event.stopPropagation();
                const title = await promptDialog({ title: "Rename", label: "+ New Session", value: item.title });
                if (!title)
                    return;
                item.title = title;
                await putSession(item);
                if (session?.session_id === item.session_id)
                    session = item;
                await refreshSessions();
                paint();
            });
            const remove = el("button", { class: "msg-action", title: "Delete" }, icon("trash", 12));
            remove.addEventListener("click", async (event) => {
                event.stopPropagation();
                if (!(await confirmDialog(`Are you sure to delete session "${item.title}"?`, { danger: true })))
                    return;
                await deleteSession(item.session_id);
                if (session?.session_id === item.session_id)
                    session = null;
                await refreshSessions();
                renderMessages();
            });
            row.appendChild(el("div", { class: "session-actions" }, rename, remove));
            listEl.appendChild(row);
        }
    }
    /* ── session actions ────────────────────────────────────────────────── */
    async function openSession(id) {
        if (running) {
            toast("Script is already running, please stop first", "warn");
            return;
        }
        const found = await getSession(id);
        if (!found)
            return;
        session = found;
        liveRaw = "";
        stepNo = 0;
        renderSessions();
        renderMessages();
        paintStatus();
    }
    async function newSession() {
        if (running)
            return;
        session = createSession("New Session");
        await putSession(session);
        await refreshSessions();
        liveRaw = "";
        stepNo = 0;
        renderSessions();
        renderMessages();
        paintStatus();
    }
    async function rollbackTo(index) {
        if (!session || running)
            return;
        if (!(await confirmDialog("Roll back to this message? Everything after it is removed.", { danger: true })))
            return;
        const message = session.messages[index];
        session.messages = session.messages.slice(0, index);
        await putSession(session);
        renderMessages();
        if (inputEl && message)
            inputEl.value = message.content;
    }
    /* ── sending ────────────────────────────────────────────────────────── */
    function currentConfig() {
        return { ...settings.get().api };
    }
    function configReady() {
        const config = currentConfig();
        return Boolean(config.url.trim() && config.model.trim());
    }
    async function send() {
        if (running || !inputEl)
            return;
        const text = inputEl.value.trim();
        if (!text)
            return;
        if (mode === "agent" && !adb.connected) {
            toast("Connect a device first", "warn");
            return;
        }
        if (!configReady()) {
            toast("Please enter API URL", "warn");
            openApiSettings();
            return;
        }
        const current = await ensureSession();
        inputEl.value = "";
        await pushMessage("user", text);
        const contextMessages = current.messages.slice(0, -1);
        const history = toLlmContext(contextMessages).map((message) => ({
            role: message.role,
            content: message.content,
        }));
        running = true;
        stopping = false;
        liveRaw = "";
        stepNo = 0;
        updateComposer();
        renderMessages();
        const clearStream = () => {
            streaming = false;
            liveRaw = "";
        };
        const finishRun = () => {
            clearStream();
            running = false;
            stopping = false;
            updateComposer();
        };
        const events = {
            step(step) {
                stepNo = step;
                liveRaw = "";
                streaming = true;
                updateComposer();
                renderMessages();
            },
            delta(chunk) {
                streaming = true;
                liveRaw += chunk;
                const liveRoot = messagesEl?.querySelector('[data-live="1"]');
                const node = liveRoot?.querySelector(".msg-body");
                if (node)
                    node.textContent = liveRaw || "Thinking...";
                if (liveRoot && messagesEl)
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                if (!liveRoot && messagesEl)
                    renderMessages();
            },
            command(tool, command) {
                clearStream();
                void pushMessage("command", `[${tool}]\n${command}`);
            },
            result(text, image) {
                clearStream();
                void pushMessage("output", text, image);
            },
            final(text) {
                finishRun();
                void pushMessage("complete", text).then(() => renderMessages());
            },
            error(message) {
                finishRun();
                toast(message, "err", 6000);
                void pushMessage("system", `⚠ ${message}`);
            },
            done() {
                finishRun();
                runner = null;
                pending = null;
                renderMessages();
            },
        };
        const confirm = () => new Promise((resolve) => {
            pending = resolve;
            renderMessages();
        });
        runner = new AgentRunner({
            config: currentConfig(),
            adb,
            events,
            confirm,
            alwaysExecute,
        });
        if (mode === "chat")
            await runner.runChat(history, text);
        else
            await runner.runAgent(history, text);
    }
    function stopRun() {
        if (!running || stopping)
            return;
        stopping = true;
        updateComposer();
        // A pending "execute?" prompt must be released, otherwise the runner
        // would sit on that promise and the Stop button would appear dead.
        resolveConfirm("stop");
        runner?.stop();
    }
    /**
     * One button in the top-right of the composer: Send → turns into Stop in
     * place while the agent runs (red border / red text).
     */
    function updateComposer() {
        if (actionBtn) {
            actionBtn.className = `btn ${running ? "danger agent-stop" : "primary agent-send"}`;
            actionBtn.replaceChildren(icon(running ? "stop" : "send", 15), el("span", null, running ? (stopping ? "Stopping…" : "Stop") : "Send"));
            actionBtn.disabled = stopping;
            actionBtn.title = running ? "Stop the agent" : "Send";
        }
        if (inputEl)
            inputEl.placeholder = running ? "Streaming…" : "Enter to send · Shift+Enter for a new line";
    }
    /* ── API settings ───────────────────────────────────────────────────── */
    /* ── layout ─────────────────────────────────────────────────────────── */
    function paintStatus() {
        const badge = body?.querySelector(".agent-model-badge");
        if (badge) {
            const config = currentConfig();
            badge.textContent = config.model || "—";
            badge.className = `badge ${configReady() ? "green" : "amber"} agent-model-badge`;
        }
        const title = body?.querySelector(".agent-session-title");
        if (title)
            title.textContent = session?.title ?? "No sessions yet";
    }
    function paint() {
        if (!body)
            return;
        body.replaceChildren();
        body.appendChild(pageHeader("Agent", "Ask the agent to do something on the phone, e.g. “open Settings and enable Wi-Fi”.", el("span", { class: "badge agent-model-badge" }, currentConfig().model || "—"), button("API settings", { icon: "key", small: true, onClick: () => openApiSettings({ onSaved: paintStatus }) })));
        listEl = el("div", { class: "session-list" });
        messagesEl = el("div", { class: "chat-list" });
        const modeSelect = el("select", { class: "select", style: "width:150px;height:30px;font-size:12px" });
        modeSelect.append(el("option", { value: "agent", selected: mode === "agent" }, "Craft"), el("option", { value: "chat", selected: mode === "chat" }, "Ask"));
        const alwaysCheck = el("input", { type: "checkbox", checked: alwaysExecute });
        alwaysCheck.addEventListener("change", () => {
            alwaysExecute = alwaysCheck.checked;
            settings.patch({ alwaysExecute });
        });
        const alwaysLabel = el("label", { class: "check", style: mode === "agent" ? "" : "display:none" }, alwaysCheck, el("span", null, "Always Execute"));
        const modeBadge = el("span", { class: "badge blue" }, mode === "agent" ? "Craft" : "Ask");
        modeSelect.addEventListener("change", () => {
            mode = modeSelect.value;
            settings.patch({ agentMode: mode });
            alwaysLabel.style.display = mode === "agent" ? "" : "none";
            modeBadge.textContent = mode === "agent" ? "Craft" : "Ask";
            renderMessages();
        });
        inputEl = el("textarea", {
            class: "textarea agent-input",
            rows: "3",
            placeholder: "Enter to send · Shift+Enter for a new line",
            style: "min-height:88px;max-height:220px;font-family:var(--sans);font-size:14px",
        });
        inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
            }
            else if (event.key === "Escape" && running) {
                event.preventDefault();
                stopRun();
            }
        });
        actionBtn = el("button", { class: "btn primary agent-send", title: "Send", type: "button" }, icon("send", 15), el("span", null, "Send"));
        actionBtn.addEventListener("click", () => {
            if (running)
                stopRun();
            else
                void send();
        });
        const composer = el("div", { class: "composer" }, el("div", { class: "row composer-tools" }, modeSelect, el("div", { class: "spacer" }), alwaysLabel, actionBtn), inputEl);
        const main = el("section", { class: "agent-main" }, el("div", { class: "agent-status" }, icon("chat", 14), el("span", { class: "agent-session-title grow" }, session?.title ?? "No sessions yet"), el("span", { class: "muted small" }, "Mode"), modeBadge), messagesEl, composer);
        const sidebar = el("aside", { class: "agent-sidebar" }, el("div", { class: "row", style: "padding:10px 10px 6px" }, button("+ New Session", { variant: "primary", small: true, icon: "plus", onClick: () => void newSession() }), el("div", { class: "spacer" }), el("span", { class: "badge session-count" }, String(sessions.length))), listEl);
        body.appendChild(el("div", { class: "agent-layout" }, sidebar, main));
        updateComposer();
        renderSessions();
        renderMessages();
        paintStatus();
    }
    return {
        id: "agent",
        icon: "bot",
        label: "Agent",
        section: "tools",
        render(root) {
            body = root;
            paint();
            void refreshSessions().then(() => {
                if (!session && sessions.length) {
                    session = sessions[0];
                }
                renderSessions();
                renderMessages();
                paintStatus();
            });
        },
        onShow() {
            void refreshSessions();
        },
        onHide() {
            // keep the run alive in the background; only the DOM is detached
        },
    };
}
