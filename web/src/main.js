import "./styles/index.css";
import { AdbController } from "./services/adb/controller.js";
import { AppShell } from "./app/shell.js";
import { el } from "./shared/dom.js";
import { errorText } from "./shared/errors.js";
async function boot() {
    const app = document.getElementById("app");
    if (!app)
        throw new Error("#app not found");
    const adb = new AdbController();
    const shell = new AppShell(app, adb);
    // Release the exclusive WebUSB interface when the ADB Studio tab closes,
    // so another program (adb server, Android Studio, scrcpy) can claim the phone again.
    window.addEventListener("pagehide", () => void adb.disconnect());
    // Debug/automation handle (also handy when developing the extension).
    window.adbStudio = { adb, shell };
    try {
        await shell.start();
    }
    catch (error) {
        app.replaceChildren(el("div", { class: "hint warn", style: "margin:40px auto;max-width:640px" }, `Failed to start ADB Studio: ${errorText(error)}`));
        throw error;
    }
}
void boot();
