/**
 * Browser KeyboardEvent -> Android KeyEvent mapping for "keys" mode.
 * Text/IME input is handled by mirror-keyboard.js's buffer mode instead.
 */

const KEY_CODES = {
  Space: 62,
  Enter: 66,
  NumpadEnter: 160,
  Backspace: 67,
  Tab: 61,
  Escape: 111,
  Delete: 112,
  Insert: 124,
  Home: 122,
  End: 123,
  PageUp: 92,
  PageDown: 93,
  ArrowLeft: 21,
  ArrowRight: 22,
  ArrowUp: 19,
  ArrowDown: 20,
  Minus: 69,
  Equal: 70,
  BracketLeft: 71,
  BracketRight: 72,
  Backslash: 73,
  Semicolon: 74,
  Quote: 75,
  Backquote: 68,
  Comma: 55,
  Period: 56,
  Slash: 76,
  Numpad0: 144,
  Numpad1: 145,
  Numpad2: 146,
  Numpad3: 147,
  Numpad4: 148,
  Numpad5: 149,
  Numpad6: 150,
  Numpad7: 151,
  Numpad8: 152,
  Numpad9: 153,
  NumpadDivide: 154,
  NumpadMultiply: 155,
  NumpadSubtract: 156,
  NumpadAdd: 157,
  NumpadDecimal: 158,
  F1: 131,
  F2: 132,
  F3: 133,
  F4: 134,
  F5: 135,
  F6: 136,
  F7: 137,
  F8: 138,
  F9: 139,
  F10: 140,
  F11: 141,
  F12: 142,
  MediaPlayPause: 85,
  MediaStop: 86,
  MediaTrackNext: 87,
  MediaTrackPrevious: 88,
  MediaRewind: 89,
  MediaFastForward: 90,
};

export const META = { shift: 1, alt: 2, ctrl: 4096, meta: 65536 };

/** Map a KeyboardEvent, or null when the key should be left to the browser. */
export function androidKeyEvent(event) {
  let keyCode = KEY_CODES[event.code];
  if (keyCode === undefined && /^Key[A-Z]$/.test(event.code)) {
    keyCode = 29 + event.code.charCodeAt(3) - 65;
  }
  if (keyCode === undefined && /^Digit[0-9]$/.test(event.code)) {
    keyCode = 7 + Number(event.code.slice(5));
  }
  if (keyCode === undefined) return null;

  let metaState = 0;
  if (event.shiftKey) metaState |= META.shift;
  if (event.altKey) metaState |= META.alt;
  if (event.ctrlKey) metaState |= META.ctrl;
  if (event.metaKey) metaState |= META.meta;
  return { keyCode, metaState };
}
