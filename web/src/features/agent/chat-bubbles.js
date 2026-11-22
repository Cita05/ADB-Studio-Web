import { renderMarkdown } from "../../shared/markdown.js";
import { copyText, el, icon, modal, toast } from "../../shared/dom.js";

const ROLE_META = {
  user: { label: "You", cls: "user" },
  thought: { label: "Thought", cls: "thought" },
  command: { label: "Command", cls: "command" },
  output: { label: "Output", cls: "output" },
  complete: { label: "Complete", cls: "complete" },
  system: { label: "System", cls: "system" },
};

function fillBody(target, role, content) {
  target.replaceChildren();
  if (role === "user" || role === "complete") target.appendChild(renderMarkdown(content));
  else target.textContent = content;
}

/**
 * Create one chat bubble. `live` adds the streaming caret, `index` enables the
 * rollback button on user messages.
 */
export function createBubble(role, content, options = {}) {
  const meta = ROLE_META[role] ?? ROLE_META.system;
  const root = el("div", { class: `msg ${meta.cls}` });
  const bubble = el("div", { class: "bubble" });
  const who = el("div", { class: "who" }, el("span", { class: "who-label" }, meta.label));
  if (options.live) who.appendChild(el("span", { class: "badge blue" }, "Streaming"));

  const actions = el("div", { class: "msg-actions" });
  if (role === "user" && options.index != null) {
    const rollback = el("button", { class: "msg-action", title: "Are you sure you want to rollback? All chat data after this message will be cleared." }, "↩");
    rollback.addEventListener("click", () => options.onRollback?.(options.index));
    actions.appendChild(rollback);
  }
  const copy = el("button", { class: "msg-action", title: "Copy" }, icon("copy", 13));
  copy.addEventListener("click", async () => {
    if (await copyText(content)) toast("Copied", "ok", 1500);
  });
  actions.appendChild(copy);
  who.appendChild(actions);

  const body = el("div", { class: `msg-body${options.live ? " streaming" : ""}` });
  fillBody(body, role, content);
  bubble.append(who, body);

  if (options.image) {
    const img = el("img", { src: options.image, class: "msg-image", alt: "screenshot" });
    img.addEventListener("click", () => {
      modal({ title: "Result", wide: true, body: el("img", { src: options.image, style: "max-width:100%" }) });
    });
    bubble.appendChild(img);
  }

  root.appendChild(bubble);
  return {
    root,
    body,
    setText(text) {
      body.textContent = text;
    },
  };
}
