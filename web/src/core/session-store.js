/* Chat session persistence (IndexedDB). Mirrors gui/chat_session.py. */
export const MAX_CONTEXT = 20;
const DB_NAME = "adbstudio";
const DB_VERSION = 1;
const STORE = "sessions";
let dbPromise = null;
function openDb() {
    return (dbPromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "session_id" });
                store.createIndex("updated_at", "updated_at");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}
function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
    });
}
export function newMessage(role, content, image) {
    const now = new Date();
    return {
        role,
        content,
        timestamp: now.toISOString(),
        message_id: `msg_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
        ...(image ? { image } : {}),
    };
}
const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
const readStore = async (run) => {
    const db = await openDb();
    return requestResult(run(db.transaction(STORE, "readonly").objectStore(STORE)));
};
export async function listSessions() {
    return (await readStore((store) => store.getAll())).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}
export const getSession = (id) => readStore((store) => store.get(id));
export async function putSession(session) {
    session.updated_at = new Date().toISOString();
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...session, messages: session.messages.map((m) => ({ ...m })) });
    await txDone(tx);
}
export async function deleteSession(id) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
}
export function createSession(title) {
    const now = new Date().toISOString();
    return {
        session_id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        created_at: now,
        updated_at: now,
        messages: [],
    };
}
/**
 * Convert stored messages into an OpenAI chat context.
 * Mirrors `ChatSession.get_llm_context`: only role+content, consecutive
 * same-role messages are merged so the API never sees invalid sequences.
 */
export function toLlmContext(messages, limit = MAX_CONTEXT) {
    const map = {
        user: "user",
        thought: "assistant",
        command: "assistant",
        output: "user",
        complete: "assistant",
    };
    const raw = [];
    for (const message of messages.slice(-limit)) {
        const role = map[message.role];
        if (role)
            raw.push({ role, content: message.content });
    }
    const merged = [];
    for (const item of raw) {
        const last = merged[merged.length - 1];
        if (last && last.role === item.role)
            last.content += `\n${item.content}`;
        else
            merged.push({ ...item });
    }
    return merged;
}
