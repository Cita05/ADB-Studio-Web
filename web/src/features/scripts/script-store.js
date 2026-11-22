/** Browser-persisted script list (localStorage). */
const STORAGE_KEY = "adbstudio.scripts.v1";

export function loadScripts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

export function saveScripts(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Insert or replace by name. */
export function upsertScript(list, script) {
  return [...list.filter((item) => item.name !== script.name), script];
}
