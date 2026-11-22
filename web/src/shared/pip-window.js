/**
 * Content-only Document Picture-in-Picture window. Callers append their own
 * canvas/image. Chrome 118+ (already required by the extension) provides the API.
 */
export async function openFloatingWindow({ width, height, title = "ADB Studio", onClose }) {
  if (!documentPictureInPicture?.requestWindow) {
    throw new Error("Document Picture-in-Picture is not available in this browser");
  }
  const win = await documentPictureInPicture.requestWindow({ width, height });
  const doc = win.document;
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent =
    "html,body{margin:0;height:100%;overflow:hidden;background:#000}body{display:flex;align-items:center;justify-content:center}";
  doc.head.appendChild(style);
  doc.body.replaceChildren();

  let closed = false;
  win.addEventListener("pagehide", () => {
    if (closed) return;
    closed = true;
    onClose?.();
  });

  return {
    win,
    doc,
    isClosed: () => closed,
    close() {
      closed = true;
      try {
        win.close();
      } catch {
        /* already closed */
      }
    },
  };
}
