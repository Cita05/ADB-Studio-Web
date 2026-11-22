# ADB Studio source

Vanilla ES Modules + Vite: no framework, no TypeScript, no local adb/scrcpy binaries.

## Commands

```bash
pnpm install
pnpm test      # node:test unit tests
pnpm build     # check-modules + vite build -> ../extension
pnpm dev       # vite dev server
pnpm bridge    # local TCP <-> WebSocket bridge
```

## Layout

- `src/main.js` boots the shell; `src/background.js` is the MV3 service worker
- `src/app/` — shell, console dock, key bar, page helpers
- `src/core/` — settings and IndexedDB session store
- `src/services/adb/` — controller (single command gateway), WebUSB, bridge, streams, key/touch primitives
- `src/services/llm/` — OpenAI-compatible SSE client and agent runner
- `src/features/` — home, apps, display, battery, adjust, mirror, scripts, agent
- `src/shared/` — DOM, formatting, files, markdown, async helpers
- `public/` — manifest, icons and the bundled `scrcpy-server` 5.0.1, copied to `extension/` on build. The client uses `@yume-chan` 3.0.0-beta.5; ADB credentials are stored with `TangoIndexedDbStorage`, so upgrading from 2.x may require accepting the USB debugging prompt once more.
- `bridge/adb-ws-bridge.mjs` — Wi-Fi relay

## Conventions

- Pages implement `{ render(root), onShow?, onHide? }`; the shell mounts and caches them.
- All device output is rendered as text or escaped HTML.
- Every ADB command goes through `AdbController.runCommand()` and is logged in the terminal.
- Screen mirror: `mirror-gestures.js` (pure geometry) → `mirror-input.js` (mouse) / `mirror-keyboard.js` (keys vs text mode) → scrcpy control. Left mouse uses a real `injectTouch` DOWN/MOVE/UP sequence (so Android long-press drag works), wheel uses `injectScroll` (`ACTION_SCROLL`, no fling), right-click uses an ADB long press. Keyboard defaults to keys mode: `mirror-keymap.js` maps browser keys to Android key codes and forwards down/up, so Space/arrows control media and games get WASD. F2 summons text/IME mode; a hidden input buffers text, Enter commits via scrcpy and returns to keys mode. Audio is decoded with WebCodecs and played through an `AudioContext` created in the click gesture. The streamer enables scrcpy `stay_awake` and sends `setDisplayPower(false)` after setup (the `-S` behaviour); the scrcpy server restores display power on cleanup.

See the root README for installation and usage.
