const STORAGE_KEY = "adbstudio.settings.v1";

export const DEFAULT_SETTINGS = Object.freeze({
  api: Object.freeze({ url: "", key: "", model: "" }),
  agentMode: "agent",
  alwaysExecute: false,
  bridgePort: 7331,
  wifiHost: "",
  wifiPort: 5555,
  dockOpen: true,
});

/** LocalStorage-backed settings, observable via `subscribe`. */
class SettingsStore {
  #value = { ...DEFAULT_SETTINGS, api: { ...DEFAULT_SETTINGS.api } };
  #listeners = new Set();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object") {
        this.#value = {
          ...this.#value,
          ...saved,
          api: { ...this.#value.api, ...(saved.api ?? {}) },
        };
      }
    } catch {
      /* corrupted storage: keep defaults */
    }
  }

  get() {
    return this.#value;
  }

  patch(partial = {}) {
    this.#value = {
      ...this.#value,
      ...partial,
      api: { ...this.#value.api, ...(partial.api ?? {}) },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#value));
    } catch {
      /* quota / private mode */
    }
    for (const listener of this.#listeners) listener(this.#value);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export const settings = new SettingsStore();
