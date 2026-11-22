import { settings } from "../../core/settings.js";
import { testApi } from "../../services/llm/client.js";
import { button, el, modal, toast } from "../../shared/dom.js";
import { errorText } from "../../shared/errors.js";
import { pickFile, saveBlob } from "../../shared/fs.js";

/**
 * OpenAI-compatible API configuration dialog: test / import / export / save.
 * @param {{ onSaved?: () => void }} options
 */
export function openApiSettings({ onSaved } = {}) {
  const config = { ...settings.get().api };
  const urlInput = el("input", { class: "input", value: config.url, placeholder: "https://api.deepseek.com/v1" });
  const keyInput = el("input", { class: "input", value: config.key, placeholder: "sk-…", type: "password" });
  const modelInput = el("input", { class: "input", value: config.model, placeholder: "deepseek-chat" });
  const status = el("div", { class: "hint", style: "display:none" });

  const showStatus = (text, ok) => {
    status.style.display = "";
    status.textContent = text;
    status.className = ok ? "hint" : "hint warn";
  };
  const readConfig = () => ({
    url: urlInput.value.trim(),
    key: keyInput.value.trim(),
    model: modelInput.value.trim(),
  });

  const testBtn = button("Test API", {
    small: true,
    icon: "plug",
    onClick: async () => {
      testBtn.disabled = true;
      showStatus("Testing...", true);
      try {
        await testApi(readConfig());
        showStatus("API connected", true);
      } catch (error) {
        showStatus(`API error: ${errorText(error)}`, false);
      } finally {
        testBtn.disabled = false;
      }
    },
  });

  const importBtn = button("Import Config", {
    small: true,
    icon: "upload",
    onClick: async () => {
      const file = await pickFile(".config,.json,text/plain,application/json");
      if (!file) return;
      try {
        const text = await file.text();
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          urlInput.value = parsed.api_url ?? parsed.API_URL ?? urlInput.value;
          keyInput.value = parsed.api_key ?? parsed.API_KEY ?? keyInput.value;
          modelInput.value = parsed.model_name ?? parsed.MODEL_NAME ?? modelInput.value;
        } else {
          for (const line of text.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
            const [key, ...rest] = trimmed.split("=");
            const value = rest.join("=").trim();
            if (/^api_url$/i.test(key)) urlInput.value = value;
            if (/^api_key$/i.test(key)) keyInput.value = value;
            if (/^model_name$/i.test(key)) modelInput.value = value;
          }
        }
        showStatus("Config imported", true);
        toast("Config imported", "ok");
      } catch (error) {
        showStatus(errorText(error), false);
      }
    },
  });

  const exportBtn = button("Export Config", {
    small: true,
    icon: "download",
    onClick: async () => {
      const cfg = readConfig();
      const content = `API_URL=${cfg.url}\nAPI_KEY=${cfg.key}\nMODEL_NAME=${cfg.model}\n`;
      const name = await saveBlob(new Blob([content], { type: "text/plain" }), "adb-studio.config", "ADB Studio API config", ".config");
      if (name) toast("Export Config", "ok");
    },
  });

  const saveBtn = button("Save", {
    variant: "primary",
    small: true,
    icon: "save",
    onClick: () => {
      settings.patch({ api: readConfig() });
      toast("API settings saved", "ok");
      dialog.close();
      onSaved?.();
    },
  });

  const dialog = modal({
    title: "API settings",
    wide: true,
    body: el(
      "div",
      { class: "stack" },
      el("div", { class: "muted small" }, "Keys are stored locally in this browser profile."),
      el("div", { class: "field" }, el("label", null, "API URL:"), urlInput),
      el("div", { class: "field" }, el("label", null, "API Key:"), keyInput),
      el("div", { class: "field" }, el("label", null, "Model:"), modelInput),
      el("div", { class: "row" }, testBtn, importBtn, exportBtn),
      status,
    ),
    footer: [button("Cancel", { small: true, onClick: () => dialog.close() }), saveBtn],
  });
}
