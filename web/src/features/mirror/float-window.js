import { openFloatingWindow } from "../../shared/pip-window.js";

/** Pure mirror window: a single canvas, no toolbar or hint text. */
export async function openMirrorWindow({ width, height, onClose }) {
  const view = await openFloatingWindow({
    width,
    height,
    title: "ADB Studio",
    onClose,
  });

  const { doc, win } = view;

  const style = doc.createElement("style");
  style.textContent =
    "canvas{max-width:100%;max-height:100%;display:block;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none}";
  doc.head.appendChild(style);

  const canvas = doc.createElement("canvas");
  canvas.width = 360;
  canvas.height = 720;
  doc.body.appendChild(canvas);

  return {
    canvas,
    doc,
    win,
    prepare(w, h) {
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      // Start at the device aspect ratio, scaled down only if it would not fit
      // on screen. No MOD+g/MOD+w resizing controls are exposed.
      const availW = win.screen?.availWidth ?? w;
      const availH = win.screen?.availHeight ?? h;
      const scale = Math.min(1, (availW * 0.92) / w, (availH * 0.92) / h);
      try {
        win.resizeTo?.(Math.round(w * scale), Math.round(h * scale));
      } catch {
        /* resize may be blocked by the browser */
      }
    },
    close: view.close,
  };
}
