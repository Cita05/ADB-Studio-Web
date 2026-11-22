import { errorText } from "../../shared/errors.js";
import { openFloatingWindow } from "../../shared/pip-window.js";

let active = false;

/**
 * Screenshot coordinate picker in a content-only floating window. The frame is
 * captured once; clicks insert coordinates and the window stays open until the
 * user closes it.
 */
export async function openCoordPicker({ adb, onInsert, onError }) {
  if (active)
    return;
  active = true;
  let view = null;
  let url = "";
  const release = () => {
    if (url) {
      URL.revokeObjectURL(url);
      url = "";
    }
  };

  try {
    view = await openFloatingWindow({
      width: 360,
      height: 800,
      title: "Coordinate Picker",
      onClose: () => {
        active = false;
        release();
      },
    });

    const img = view.doc.createElement("img");
    img.draggable = false;
    img.style.cssText =
      "max-width:100%;max-height:100%;display:block;cursor:crosshair;user-select:none;-webkit-user-drag:none";
    img.addEventListener("click", (event) => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const rect = img.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * img.naturalWidth);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * img.naturalHeight);
      if (x < 0 || y < 0 || x > img.naturalWidth || y > img.naturalHeight) return;
      onInsert(`${x} ${y}`);
    });
    view.doc.body.appendChild(img);

    const shot = await adb.screenshotPng();
    if (view.isClosed()) return;
    url = URL.createObjectURL(shot);
    img.src = url;
  } catch (error) {
    view?.close();
    active = false;
    release();
    onError(errorText(error));
  }
}
