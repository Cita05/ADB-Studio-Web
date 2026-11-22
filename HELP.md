# ADB Studio User Manual

> Applies to ADB Studio Web 1.6 with bundled scrcpy-server 5.0.1.  
> For end users. For build and architecture details, see [README.md](README.md).

## Contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Install](#3-install)
4. [Connect a device](#4-connect-a-device)
5. [Interface](#5-interface)
6. [Pages](#6-pages)
7. [Bottom bar](#7-bottom-bar)
8. [ADB terminal](#8-adb-terminal)
9. [Screen mirror](#9-screen-mirror)
10. [Shortcuts](#10-shortcuts)
11. [Data and privacy](#11-data-and-privacy)
12. [FAQ](#12-faq)
13. [Troubleshooting](#13-troubleshooting)
14. [Safety](#14-safety)
15. [Quick start](#15-quick-start)

---

## 1. Overview

ADB Studio runs in Chrome or Edge. It controls Android devices over WebUSB or a local Wi-Fi bridge. It does not require `adb.exe`, a Python install, or the scrcpy desktop client.

Use it to:

- View device information and reboot the phone.
- Manage apps, APKs, display settings, battery state, and system tuning.
- Write and run ADB command scripts.
- Use an OpenAI-compatible AI agent.
- Mirror the screen and control it with a mouse and keyboard.
- Play phone audio on the computer.

Not supported: camera mirroring, OTG, gamepads, PC microphone injection, automatic two-way clipboard sync, and screen recording.

---

## 2. Requirements

| Item | Requirement |
| --- | --- |
| Browser | Chrome or Edge 118+ on desktop |
| Phone | Developer options and USB debugging enabled |
| USB | Data cable; allow the RSA prompt on the phone |
| Wi-Fi | Node.js 20.19+ to run the local bridge |
| Audio mirroring | Android 11+ |
| Video mirroring | Chrome/Edge with WebCodecs and Document Picture-in-Picture |
| Devices | One device at a time |

Firefox and Safari do not support the required WebUSB, Document PiP, and WebCodecs combination.

---

## 3. Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Pin ADB Studio to the toolbar.
6. Click the toolbar icon to open the app.

After rebuilding the extension, click **Reload** on the extensions page.

The phone may ask for USB debugging authorization again after installation or upgrade. This is normal.

---

## 4. Connect a device

### 4.1 USB

1. On the phone, enable **Developer options**.
2. Enable **USB debugging**.
3. Connect the phone with a data cable.
4. In ADB Studio, click **Connect USB**.
5. Select the phone in the browser dialog.
6. On the phone, tap **Allow** for the USB debugging prompt.

When connected:

- The header shows the device name.
- **Home** loads device information.
- The bottom bar becomes active.

USB access is exclusive. If **USB interface is busy** appears:

1. Run:
   ```bash
   adb kill-server
   ```
2. Close Android Studio, scrcpy, Android emulators, phone assistants, and other tools that use ADB.
3. Unplug and replug the cable, or toggle USB debugging off and on.
4. Click **Retry**.

### 4.2 Wi-Fi

A browser cannot open a raw TCP socket. Wi-Fi mode uses a local WebSocket bridge.

**Step 1: Enable wireless ADB**

Connect over USB first. Open **Home → Wireless ADB → Enable Wi-Fi ADB**.

Alternatively, run:

```bash
adb tcpip 5555
```

**Step 2: Start the bridge**

From the project folder, run:

```bash
node bridge/adb-ws-bridge.mjs --port 7331
```

**Step 3: Connect**

1. Click **Wi-Fi** in the header, or **Network Debug** on Home.
2. Enter the phone IP, for example `192.168.1.23`.
3. Set **Port** to `5555`.
4. Set **Bridge port** to `7331`.
5. Click **Connect**.

Keep the phone and computer on the same network. Allow the bridge port through the local firewall if needed. The bridge listens on `127.0.0.1` only.

### 4.3 Disconnect

Use **Disconnect** in the header or on the Home device card. Disconnecting also stops mirroring.

---

## 5. Interface

```text
┌──────────────────────────────────────────────────────────────┐
│ Brand   Device   Connect USB / Wi-Fi   Disconnect  Console  Guide │
├──────────┬────────────────────────────────────┬──────────────┤
│ Device   │                                    │              │
│  Home    │           Active page              │  ADB terminal │
│ Manage   │                                    │  (collapsible)│
│ Software │                                    │              │
│ Display  │                                    │              │
│ Battery  │                                    │              │
│ Adjust   │                                    │              │
│ Tools    │                                    │              │
│ Scripts  │                                    │              │
│ Agent    │                                    │              │
├──────────┴────────────────────────────────────┴──────────────┤
│ Back Home Recents | Vol+ Vol- Mute | Power | Screen Cast | Screenshot │
└──────────────────────────────────────────────────────────────┘
```

- **Header:** device status, USB/Wi-Fi connection, disconnect, console, built-in Guide.
- **Sidebar:** Home, Software, Display, Battery, Adjust, Scripts, Agent.
- **Right dock:** ADB terminal. Collapse it with the terminal icon in the header.
- **Bottom bar:** hardware keys, screen cast, screenshot.

The built-in **Guide** is a quick reference. This manual is the full guide.

---

## 6. Pages

### 6.1 Home

Shows:

- Brand, model, codename
- Android version and API level
- CPU architecture, GPU/storage type, board, platform
- Resolution and DPI
- Uptime, battery voltage and temperature
- Build fingerprint and kernel version

Actions:

| Button | Action |
| --- | --- |
| Refresh | Reload device information |
| Network Debug | Open the Wi-Fi connection dialog |
| Reboot | Normal reboot |
| Fastboot | Reboot to bootloader |
| EDL | Reboot to EDL; device support varies |
| Shutdown | Power off |
| Recovery | Reboot to recovery |
| Enable Wi-Fi ADB | Run `adb tcpip 5555` over the current USB connection |
| Connect | Open the Wi-Fi dialog |
| Disconnect | Disconnect the device |

> Fastboot, EDL, and Recovery behaviors differ by vendor. Know how to exit these modes before using them.

### 6.2 Software

Filters:

- **List All Apps**
- **List System Apps**
- **List Third-Party Apps**

Use the search box to filter by package name. Click a row to select an app.

**Package Management**

| Button | Action |
| --- | --- |
| Enable | Enable a disabled app |
| Disable | Disable an app |
| Start | Launch the app |
| Force Stop | Stop the app |
| Export APK | Save the APK to the computer |
| Clear Data | Clear app data; asks for confirmation |
| Uninstall | Uninstall the app; asks for confirmation |
| Get Foreground | Read the current foreground package |

**Install APK**

1. Click the dashed drop area and choose an `.apk`, or drag an APK onto it.
2. Click **Install** for a normal install.
3. Click **Reinstall** to replace an existing installation.

> Clear Data and Uninstall cannot be undone. System apps may not allow disabling or uninstallation.

### 6.3 Display

The page shows physical size, override size, physical DPI, and override DPI.

**Resolution Settings**

1. Enter width and height.
2. Click **Set Resolution**.
3. Click **Reset Resolution** to restore the default.

**DPI Settings**

1. Enter a DPI value.
2. Click **Set DPI**.
3. Click **Reset DPI** to restore the default.

> Wrong resolution or DPI values can break app layouts. Use Reset or reboot the phone if the UI becomes unusable.

### 6.4 Battery

Shows:

- Level, status, temperature, voltage
- Health, technology
- AC, USB, and present state

**Battery Simulation**

- Set a fake battery level.
- Simulate or stop AC charging.
- Simulate or stop USB charging.
- Click **Reset** to restore the real state.

> Simulation is not real charging. Always click **Reset** after testing.

### 6.5 Adjust

| Slider | Range | Effect |
| --- | --- | --- |
| Font Size | 0.50× to 2.00× | System font scale |
| Animation Speed | 0.0× to 10.0× | Window, transition, and animator scales |
| Screen Off | 5 to 300 seconds | Screen timeout |
| Brightness | 0 to 255 | Screen brightness |

A slider applies when released.

Brightness also has:

- **Turn Auto Brightness On**
- **Turn Auto Brightness Off**

> Animation speed 0 can make the UI appear unresponsive. Extreme font or brightness values can make the phone hard to operate.

### 6.6 Scripts

Write one ADB-style command per line:

```text
# Return to the home screen
shell input keyevent 3

sleep 1

# Open Settings
shell am start -a android.settings.SETTINGS

# Tap a point
shell input tap 540 1200
```

Rules:

- Lines starting with `#` are comments.
- Empty lines are ignored.
- `sleep 1.5` waits 1.5 seconds.
- Other lines run through ADB.
- **Save** stores the script. A name and content are required.
- **Run** executes commands in order.
- **Stop** stops after the current command returns. Long-running commands are not interrupted immediately.
- **Clear** empties the editor.

**Get Coordinates**

1. Click **Get Coordinates**.
2. A screenshot opens in a floating window.
3. Click a point in the screenshot.
4. The `x y` coordinates are inserted at the editor cursor.

**Button Palette**

- Inserts navigation, volume, power, touch, text-input, and sleep templates.
- Hover or click a button to see its hint.

**Saved Scripts**

- **Load** opens a script.
- Delete asks for confirmation.
- **Import** and **Export** use JSON files for backup.

Scripts are stored in the current browser profile. Export important scripts before clearing browser data.

> Scripts have no undo. Check destructive commands before running them.

### 6.7 Agent

Configure the API first:

1. Click **API settings**.
2. Enter an OpenAI-compatible **API URL**, **API Key**, and **Model**.
3. Click **Test API** to verify.
4. Click **Save**.

Example URL: `https://api.deepseek.com/v1`. The client appends `/chat/completions`.

Modes:

| Mode | Behavior |
| --- | --- |
| **Craft** | Can call device tools and operate the phone |
| **Ask** | Chat only; does not control the phone |

Craft tools:

- `adb`: run ADB commands.
- `screen`: take a screenshot.

Command confirmation:

- **Execute** runs the proposed command.
- **Reject** skips it.
- **Stop** stops the run.
- **Always Execute** disables per-command confirmation. Use only in a trusted environment.

Input:

- **Enter** sends.
- **Shift+Enter** inserts a new line.
- While running, **Send** changes to **Stop**.
- **Esc** also stops the run.

Sessions:

- **+ New Session** creates a session.
- The gear icon renames a session.
- The trash icon deletes a session.
- Click a user message's **↩** to roll back to that message. Later messages are removed.
- Each message can be copied.

> The browser sends API requests directly to the configured endpoint. The endpoint must allow browser CORS. The API key is stored in browser local storage; avoid it on shared computers.

---

## 7. Bottom bar

| Button | Action |
| --- | --- |
| Back | Android Back |
| Home | Android Home |
| Recents | Recent apps |
| Vol+ / Vol- | Volume up/down |
| Mute | Mute media |
| Power | Power key |
| Long Press Power | Power menu |
| Screen Cast / Stop Cast | Start or stop mirroring |
| Screenshot | Save a PNG screenshot to downloads |

Bottom-bar key presses are logged in the ADB terminal.

---

## 8. ADB terminal

The right-hand **ADB terminal** accepts adb-style commands:

```text
shell input keyevent 3
shell wm size
shell pm list packages
shell settings get system font_scale
reboot
uninstall com.example.app
```

- Press **Enter** to run.
- Click **Run** to run.
- Click the trash icon to clear the display.
- Enter `clear` or `cls` to clear the display.
- The dock keeps the last 700 lines.
- The terminal icon in the header collapses or expands the dock.
- A dot appears when new logs arrive while collapsed.
- All ADB commands issued by the app are logged here.

> The terminal does not ask for confirmation. Do not paste commands you do not understand.

---

## 9. Screen mirror

### 9.1 Start and stop

1. Connect a device.
2. Click **Screen Cast** in the bottom bar.
3. A Picture-in-Picture window opens with the phone screen and audio.
4. Close the window or click **Stop Cast** to stop.

The first cast pushes the bundled scrcpy-server to the phone. This can take a few seconds.

### 9.2 Startup behavior

- The phone display turns off automatically. This is intentional and matches scrcpy `-S`.
- The device stays awake with scrcpy `-w`, so it does not sleep while mirrored.
- Video and audio continue while the display is off.
- The window opens at the device aspect ratio. If it is larger than the screen, it scales down to about 92% of the available screen.
- On close, the scrcpy server normally restores the phone display. If it stays off, press the phone power key or click **Power** in the bottom bar.

### 9.3 Mouse controls

| Input | Action |
| --- | --- |
| Wheel up/down | Precise scroll at the pointer; stops immediately |
| Left click | Tap |
| Left press and hold, then drag | Long-press drag; use it to move home-screen icons or edit layouts |
| Left quick drag | Swipe or scroll |
| Middle click | Recents |
| Right click | Long press |
| Mouse Back | Android Back |
| Mouse Forward | Android Home |

For long-press drag, press and hold the left button first. Wait about half a second for Android to start the long press, then move the mouse. Moving too early becomes a swipe.

### 9.4 Keyboard: keys mode

Keys mode is the default. No input box is shown. Keys go directly to Android.

| Key | Action |
| --- | --- |
| Space | Play/pause, if the current app supports it |
| Left/Right arrow | Seek, if the current app supports it |
| Up/Down arrow | App-dependent |
| Letters, digits, WASD | Sent to Android; useful for games and ASCII input |
| Enter | Enter |
| Esc | Esc; behavior depends on the app |
| Ctrl+A/C/X/V/Z/Y | Forwarded to Android |
| F2 | Enter text/IME mode; not sent to Android |

> Media keys work only when the current app supports Space or arrow keys. Some apps ignore them.

### 9.5 Keyboard: text/IME mode

Press **F2** to enter text mode.

- A translucent buffer appears at the top left.
- A hidden input gets focus and uses the system IME.
- Chinese, Japanese, and Korean candidates work.
- Both Shift keys work normally. Use left Shift for IME switching.
- **Enter** commits the text and returns to keys mode.
- Empty **Enter** sends Android Enter.
- Empty **Backspace** sends Android Del.
- **Esc** exits text mode without sending Back.
- Press **F2** again to exit text mode.

**Typing Chinese**

1. Click the phone's text field in the mirror.
2. Press **F2**.
3. Type with the IME.
4. Press **Enter** to commit and exit.

Text mode sends text, not individual key events. Some games and text fields reject text injection. Use keys mode for those cases.

### 9.6 Clipboard

- ASCII text uses scrcpy text injection.
- Unicode text, including Chinese, uses the device clipboard and paste.
- This writes text into the phone clipboard. Other apps may read it. Do not paste passwords or other sensitive text.
- The app does not automatically sync the phone clipboard to the computer. It does not poll the clipboard.

### 9.7 Audio

- Phone audio is forwarded to the computer as Opus.
- Android 11 or later is required.
- There is no PC microphone-to-phone channel. This app cannot inject the computer microphone into a phone call.
- Use **Vol+**, **Vol-**, and **Mute** in the bottom bar to adjust phone volume.

### 9.8 Window and focus

- The PiP window stays on top.
- The window uses the device aspect ratio and scales to fit the screen. There are no 1:1, fit-to-content, or fullscreen shortcuts.
- Keyboard input is sent only while the PiP window has focus.
- Clicking another window or tab stops keyboard capture. Click the mirror again to resume.
- Closing the PiP window stops video, audio, and input.

### 9.9 Limitations

- One device at a time.
- Requires Chrome/Edge 118+, WebCodecs, and Document Picture-in-Picture.
- No camera mirroring, OTG, gamepad, or recording.
- Some systems or apps restrict audio capture. Video continues.
- If the video goes black or stops after the display turns off, send the `[mirror]` logs to the developer.

---

## 10. Shortcuts

### 10.1 Mirror window

| Input | Action |
| --- | --- |
| Wheel | Precise scroll |
| Left click | Tap |
| Left hold + drag | Long-press drag |
| Left quick drag | Swipe |
| Middle click | Recents |
| Right click | Long press |
| Mouse Back / Forward | Back / Home |
| F2 | Toggle text/IME mode |
| Space | Play/pause |
| Left/Right arrow | Seek |
| Enter (text mode) | Commit and exit |
| Esc (text mode) | Exit text mode |
| Ctrl+A/C/X/V/Z/Y | Android shortcuts |
| Left Shift (text mode) | IME switch |

### 10.2 App

| Location | Key |
| --- | --- |
| Agent input | Enter sends; Shift+Enter adds a line |
| Agent running | Esc stops |
| ADB terminal | Enter runs |
| Scripts editor | `#` comment; `sleep` waits |

### 10.3 Bottom bar

| Button | Action |
| --- | --- |
| Back / Home / Recents | Navigation |
| Vol+ / Vol- / Mute | Volume |
| Power | Power key |
| Long Press Power | Power menu |
| Screen Cast / Stop Cast | Mirror |
| Screenshot | Save a screenshot |

---

## 11. Data and privacy

- Settings, scripts, and the API key are stored in browser local storage.
- Agent sessions are stored in IndexedDB.
- ADB authorization keys are stored in the browser profile.
- The app does not upload device data. Only the Agent sends input and necessary context to the configured API.
- The Wi-Fi bridge listens on `127.0.0.1` only.
- Clipboard injection writes text into the phone clipboard. Phone apps may read it.
- Scripts and the Agent can run arbitrary ADB commands. Run only commands you understand.

Clearing browser site data removes settings, scripts, and sessions. Export important scripts first.

---

## 12. FAQ

**Do I need adb or scrcpy installed?**  
No. USB uses WebUSB, and the scrcpy server is bundled. Wi-Fi mode needs Node.js only for the bridge.

**Does it work in Firefox or Safari?**  
No. Use desktop Chrome or Edge 118+.

**Can I connect multiple phones?**  
No. One device at a time.

**Does it need root?**  
No. It uses ordinary ADB capabilities.

**Can it mirror the camera, OTG, or a gamepad?**  
No. It supports display mirroring and mouse/keyboard/touch input only.

**Why did the phone screen turn off?**  
Mirroring starts with the display off (`-S`) and keeps the device awake (`-w`). This is intentional. Closing the mirror normally restores the display. If not, press Power.

**Why is there no audio?**  
Audio requires Android 11+ and a system that allows capture. Some devices or apps may block it.

**Can I use my computer microphone for calls?**  
No. Audio is phone-to-computer only. The app cannot inject the computer microphone into the phone.

**How do I type Chinese?**  
Click the phone text field, press F2, type with the IME, then press Enter.

**Why do Space or arrow keys not control video?**  
Make sure you are in keys mode, the PiP window has focus, and the current app supports those keys.

**Why does long-press drag become a swipe?**  
You moved too early. Press and hold, wait about half a second, then drag.

**Why is the mirror window not pixel-perfect?**  
The window preserves the device aspect ratio and scales to fit the screen. There are no 1:1 or fit controls.

**Why is the phone still off after closing the mirror?**  
The server normally restores the display. If it does not, press the phone Power key or click **Power** in the bottom bar.

**Why does Stop not stop a script immediately?**  
Stop waits for the current command to return. Long-running commands are not cancelled.

**Why does the Agent fail with an API error?**  
Check the URL, key, and model. Click **Test API**. The endpoint must allow browser CORS.

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| WebUSB unavailable | Unsupported browser or wrong page context | Use Chrome/Edge 118+ and open the installed extension |
| Connect USB does nothing | USB debugging off, no authorization, or bad cable | Enable USB debugging, allow the prompt, replace the cable, replug |
| USB interface is busy | adb server, Android Studio, scrcpy, or an emulator holds the interface | Run `adb kill-server`, close those programs, retry |
| Wi-Fi connection fails | Bridge not running, wrong IP/port, different network, firewall | Start the bridge, check IP/5555/7331, use the same network |
| Mirror fails to start | WebCodecs missing, server push failed, control channel failed | Check `[mirror]` logs, reconnect, reload the extension |
| Mirror is black or frozen | Display-off restriction or encoder issue | Wake the phone, reconnect, send logs |
| No mirror audio | Android version too old, capture blocked, phone muted | Use Android 11+, raise volume, check `[mirror] audio` logs |
| Chinese text does not work | Keys mode active, or no phone text field focused | Click the phone field, press F2, type, press Enter |
| Media keys do nothing | Text mode active, PiP unfocused, or app unsupported | Exit text mode, click the mirror, use a compatible app |
| Long-press drag becomes swipe | Pointer moved before the long press | Hold still for about half a second, then drag |
| Clipboard paste does nothing | App rejects paste or clipboard was replaced | Focus the input, submit again; do not rely on clipboard |
| Script fails | Syntax error, device disconnected, or permission denied | Check the terminal log and test commands one by one |
| Agent does not run commands | API not configured, command not confirmed, or device disconnected | Configure API, click Execute, connect the device |
| UI broken after display change | Unsupported resolution or DPI | Reset Display settings, or reboot the phone |

---

## 14. Safety

- **Fastboot / EDL / Recovery / Shutdown:** the phone may enter a special mode. Know how to exit.
- **Clear Data / Uninstall:** no undo.
- **Resolution / DPI:** can make the UI unusable. Use Reset or ADB if needed.
- **Battery Simulation:** click Reset after testing.
- **Scripts / Agent:** can run arbitrary commands. There is no undo.
- **Always Execute:** disables command confirmation. Use only in a trusted environment.
- **Clipboard:** do not paste passwords or verification codes.
- **API Key:** stored in browser local storage. Do not use shared computers.

---

## 15. Quick start

1. Load `extension/` in Chrome or Edge.
2. Enable USB debugging and connect the phone.
3. Click **Connect USB** and allow the phone prompt.
4. Confirm device information on **Home**.
5. Click **Screen Cast**.
6. The phone screen turns off, the device stays awake, and the mirror opens.
7. Use the mouse and wheel. Hold left click, wait, then drag to move icons.
8. Press **F2**, type Chinese, then press **Enter**.
9. Close the mirror. The phone display returns.

---

## Appendix: common commands

Use these in the ADB terminal or Scripts:

```text
shell input keyevent 3          # Home
shell input keyevent 4          # Back
shell input keyevent 187        # Recents
shell input keyevent 26         # Power
shell input keyevent 24         # Volume up
shell input keyevent 25         # Volume down
shell input keyevent 164        # Mute
shell input tap 540 1200        # Tap
shell input swipe 540 1800 540 600 300   # Swipe up
shell wm size                   # Resolution
shell wm density                # DPI
shell am start -a android.settings.SETTINGS   # Open Settings
shell pm list packages          # List packages
```

Coordinates are phone pixels, not mirror-window pixels.
