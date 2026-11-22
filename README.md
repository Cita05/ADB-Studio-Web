# ADB Studio

A browser-based Android device manager for Chrome/Edge (Manifest V3). It talks to `adbd` directly over WebUSB or through a small local WebSocket bridge — no `adb.exe`, Python, or scrcpy client required.

> **User guide:** [HELP.md](HELP.md) — installation, device connection, every page, mirror controls and troubleshooting.

## Install

1. Open `chrome://extensions` (or `edge://extensions`) and enable Developer mode.
2. Choose **Load unpacked** and select `extension/`.
3. Click the toolbar icon to open the app.

Chrome 118+ is required for WebUSB.

## Build

```bash
cd web
pnpm install
pnpm build     # static check + vite build -> ../extension
pnpm test      # node:test unit tests
pnpm dev       # vite dev server
pnpm bridge    # local TCP <-> WebSocket bridge for Wi-Fi
```

`extension/` is the ready-to-load output. After a rebuild, click **Reload** on the extensions page. The mirror uses the bundled **scrcpy-server 5.0.1** with `@yume-chan` **3.0.0-beta.5**; after the dependency upgrade, the phone may ask once more to authorise the browser's ADB key.

## Features

- USB / Wi-Fi connection, device info, quick reboot
- Package management, APK install/export, screenshots
- Display, battery and system tuning
- ADB terminal, hardware keys, script editor with coordinate picker
- Screen mirror in a Picture-in-Picture window: H.264 via WebCodecs, Opus audio to the default output (Android 11+). Controls: wheel = precise `ACTION_SCROLL` (no fling), left = tap / long-press drag, middle = recents, right = long press, side buttons = back/home. Keys mode forwards raw keys to Android (Space/←/→ control media); press F2 for text/IME mode, where Enter commits and closes it. Ctrl+A/C/X/V/Z/Y shortcuts are forwarded, and Unicode text goes through the device clipboard. Casting starts with the phone display off (`-S`) and the device kept awake (`-w`), then restores the display when the mirror closes.
- Agent: OpenAI-compatible chat and tool calling (`adb`, `screen`); sessions in IndexedDB

## Wi-Fi

Start the bridge with `pnpm bridge` (port 7331), enable wireless ADB on the phone, then connect from the **Wi-Fi** dialog using the phone IP and port 5555.

## Privacy

Settings, scripts and chats stay in the browser profile. Data is only sent to the LLM API you configure. The bridge listens on `127.0.0.1` only.

## License

Apache-2.0. The ADB protocol implementation comes from ya-webadb (Apache-2.0).
