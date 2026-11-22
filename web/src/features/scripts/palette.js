/** Command palette for the script editor. */
export const PALETTE = [
  {
    category: "Navigation Keys",
    buttons: [
      { name: "Back", template: "shell input keyevent 4", hint: "Back key: go back to previous screen" },
      { name: "Home", template: "shell input keyevent 3", hint: "Home key: go back to device home screen" },
      { name: "Recents", template: "shell input keyevent 187", hint: "Recents key: view recently used apps" },
    ],
  },
  {
    category: "Volume Controls",
    buttons: [
      { name: "Vol+", template: "shell input keyevent 24", hint: "Volume Up: increase media volume" },
      { name: "Vol-", template: "shell input keyevent 25", hint: "Volume Down: decrease media volume" },
      { name: "Mute", template: "shell input keyevent 164", hint: "Mute: mute all media sound" },
    ],
  },
  {
    category: "Power Controls",
    buttons: [
      { name: "Power", template: "shell input keyevent 26", hint: "Power Key: press power key (screen on/off)" },
      { name: "Long Press Power", template: "shell input keyevent --longpress 26", hint: "Long Press Power: hold power key (show power menu)" },
    ],
  },
  {
    category: "Touch Operations",
    buttons: [
      { name: "Tap Position", template: "shell input tap <x> <y>", hint: "Tap Position:\n- x: X coordinate (0 at top left)\n- y: Y coordinate (0 at top left)" },
      { name: "Long Press", template: "shell input swipe <x> <y> <x> <y> <duration_ms>", hint: "Long Press Position:\n- x: X coordinate\n- y: Y coordinate\n- ms: press duration" },
      { name: "Swipe Screen", template: "shell input swipe <x1> <y1> <x2> <y2> <duration_ms>", hint: "Swipe Screen:\n- x1: starting X coordinate\n- y1: starting Y coordinate\n- x2: ending X coordinate\n- y2: ending Y coordinate\n- ms: swipe duration (ms, optional)" },
      { name: "Input Text", template: 'shell input text "<your_text>"', hint: "Input Text:\n- text: text to enter (wrap in quotes)" },
    ],
  },
  {
    category: "Flow Control",
    buttons: [{ name: "Pause [sec]", template: "sleep <seconds>", hint: "Sleep:\n- sec: time to sleep (seconds, e.g. 1.0, 3.0)" }],
  },
];
