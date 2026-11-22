/* Minimal, safe markdown renderer (all input HTML-escaped first). */
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ESCAPES[char]);
function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return out;
}
/** Render markdown into a DocumentFragment. */
export function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    let index = 0;
    const take = (predicate) => {
        const out = [];
        while (index < lines.length && predicate(lines[index])) out.push(lines[index++]);
        return out;
    };
    const inlineNode = (tag, text) => {
        const node = document.createElement(tag);
        node.innerHTML = inline(text);
        return node;
    };
    while (index < lines.length) {
        const line = lines[index];
        if (/^\s*```/.test(line)) {
            const language = line.trim().replace(/^```/, "").trim();
            index += 1;
            const codeLines = take((text) => !/^\s*```/.test(text));
            index += 1;
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            if (language)
                code.className = `lang-${language}`;
            code.textContent = codeLines.join("\n");
            pre.appendChild(code);
            fragment.appendChild(pre);
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const level = Math.min(6, heading[1].length + 2);
            const node = document.createElement(`h${level}`);
            node.innerHTML = inline(heading[2]);
            fragment.appendChild(node);
            index += 1;
            continue;
        }
        if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
            fragment.appendChild(document.createElement("hr"));
            index += 1;
            continue;
        }
        if (/^\s*>/.test(line)) {
            const quote = document.createElement("blockquote");
            quote.innerHTML = inline(take((text) => /^\s*>/.test(text)).map((text) => text.replace(/^\s*>\s?/, "")).join(" "));
            fragment.appendChild(quote);
            continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const list = document.createElement("ul");
            for (const raw of take((text) => /^\s*[-*+]\s+/.test(text))) {
                list.appendChild(inlineNode("li", raw.replace(/^\s*[-*+]\s+/, "")));
            }
            fragment.appendChild(list);
            continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const list = document.createElement("ol");
            for (const raw of take((text) => /^\s*\d+[.)]\s+/.test(text))) {
                list.appendChild(inlineNode("li", raw.replace(/^\s*\d+[.)]\s+/, "")));
            }
            fragment.appendChild(list);
            continue;
        }
        if (!line.trim()) {
            index += 1;
            continue;
        }
        const paragraphLines = take((text) => text.trim() && !/^\s*(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|---)/.test(text));
        const paragraph = document.createElement("p");
        paragraph.innerHTML = inline(paragraphLines.join("\n")).replace(/\n/g, "<br>");
        fragment.appendChild(paragraph);
    }
    return fragment;
}
export function plainText(source, limit = 4000) {
    return source.length > limit ? `${source.slice(0, limit)}…` : source;
}
