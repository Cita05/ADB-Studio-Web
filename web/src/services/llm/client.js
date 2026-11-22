export function normalizeUrl(url) {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!trimmed)
        throw new Error("API URL is empty");
    return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}
function headers(config) {
    const key = config.key.trim();
    return { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) };
}
function messageText(content) {
    if (typeof content === "string")
        return content;
    return Array.isArray(content)
        ? content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("")
        : "";
}
async function errorFromResponse(response) {
    let detail = "";
    try {
        detail = (await response.text()).slice(0, 600);
    }
    catch {
        /* ignore */
    }
    return new Error(`API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
}
function normalizeToolCalls(calls) {
    if (!Array.isArray(calls))
        return [];
    return calls
        .filter((call) => call?.function?.name)
        .map((call, index) => ({
            id: call.id || `call_${index}`,
            type: "function",
            function: {
                name: call.function.name,
                arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}),
            },
        }));
}
/**
 * OpenAI-compatible chat completion with optional native tool calling.
 * Returns `{ content, toolCalls, finishReason }`; content streams through onDelta.
 */
export async function streamChatWithTools(config, messages, options = {}) {
    if (!config.model.trim())
        throw new Error("Model name is empty");
    const url = normalizeUrl(config.url);
    const payload = {
        model: config.model.trim(),
        messages,
        stream: true,
        temperature: options.temperature ?? 0.2,
    };
    if (options.tools?.length)
        payload.tools = options.tools;
    let response = await fetch(url, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify(payload),
        signal: options.signal,
    });
    if (!response.ok) {
        const error = await errorFromResponse(response);
        if (options.tools?.length && [400, 404, 422].includes(response.status))
            throw new Error(`This API/model rejected native tool calling. Use a function-calling-capable model. (${error.message})`);
        throw error;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("event-stream") || !response.body) {
        const json = (await response.json());
        if (json.error?.message)
            throw new Error(json.error.message);
        const message = json.choices?.[0]?.message ?? {};
        const content = messageText(message.content ?? "");
        if (content && options.onDelta)
            options.onDelta(content);
        return {
            content,
            toolCalls: normalizeToolCalls(message.tool_calls),
            finishReason: json.choices?.[0]?.finish_reason ?? "stop",
        };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason = "stop";
    const calls = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:"))
                continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]")
                continue;
            try {
                const json = JSON.parse(data);
                if (json.error?.message)
                    throw new Error(json.error.message);
                const choice = json.choices?.[0];
                if (!choice)
                    continue;
                if (choice.finish_reason)
                    finishReason = choice.finish_reason;
                const delta = choice.delta ?? choice.message ?? {};
                const text = messageText(delta.content ?? "");
                if (text) {
                    content += text;
                    options.onDelta?.(text);
                }
                for (const call of delta.tool_calls ?? []) {
                    const index = call.index ?? calls.length;
                    const entry = (calls[index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
                    if (call.id)
                        entry.id = call.id;
                    if (call.function?.name)
                        entry.function.name += call.function.name;
                    if (call.function?.arguments)
                        entry.function.arguments += call.function.arguments;
                }
            }
            catch (error) {
                if (error instanceof SyntaxError)
                    continue;
                throw error;
            }
        }
    }
    return { content, toolCalls: calls.filter(Boolean), finishReason };
}
export async function testApi(config) {
    const url = normalizeUrl(config.url);
    const response = await fetch(url, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
            model: config.model.trim(),
            messages: [{ role: "user", content: "hi" }],
            stream: false,
        }),
    });
    if (!response.ok)
        throw await errorFromResponse(response);
    const json = (await response.json());
    return json.choices?.[0]?.message?.content ?? "OK";
}
export function userMessage(text, image) {
    if (!image)
        return { role: "user", content: text };
    return {
        role: "user",
        content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: image } },
        ],
    };
}
export function textOf(message) {
    return messageText(message.content);
}
