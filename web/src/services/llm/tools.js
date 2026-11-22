import { errorText } from "../../shared/errors.js";

export const TOOL_NAMES = ["adb", "screen"];
export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "adb",
      description:
        'Run one adb command on the connected phone. Omit the "adb" prefix; the "shell" prefix is optional. Examples: "input tap 540 1200", "pm list packages -3", "dumpsys battery".',
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The adb command to run." },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen",
      description: "Capture the current phone screen as an image. Use it when the UI state is unknown.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];
export async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
        reader.readAsDataURL(blob);
    });
}
export async function runTool(name, command, adb) {
    if (!adb.connected) {
        return { text: "Error: no device is connected. Ask the user to connect a phone first." };
    }
    switch (name) {
        case "adb": {
            const text = await adb.agentAdb(command);
            return { text: text.length > 8000 ? `${text.slice(0, 8000)}\n…(output truncated)` : text };
        }
        case "screen": {
            try {
                const blob = await adb.screenshotPng();
                const image = await blobToDataUrl(blob);
                return { text: `Screenshot captured (${(blob.size / 1024).toFixed(0)} KB PNG).`, image };
            }
            catch (error) {
                return { text: `Screenshot failed: ${errorText(error)}` };
            }
        }
        default:
            return { text: `Unknown tool "${name}". Available tools: ${TOOL_NAMES.join(", ")}.` };
    }
}
