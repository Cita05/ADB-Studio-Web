import { errorText } from "../../shared/errors.js";
import { streamChatWithTools, userMessage } from "./client.js";
import { TOOL_NAMES, TOOL_SCHEMAS, runTool } from "./tools.js";

const MAX_STEPS = 24;
const SYSTEM_PROMPT = `You control one Android phone through the provided tools.
Use a tool when it helps. Prefer the smallest concrete command, and use the screen tool when the UI is unknown.
Never claim an action succeeded unless a tool returned a result. If a command fails, adapt or explain what is blocked.
When the task is finished, answer the user naturally in their language.`;

// Read-only commands do not need a confirmation click.
const READ_ONLY =
  /^(?:shell\s+)?(?:getprop\b|dumpsys(?!\s+battery\s+(?:set|reset))\b|pm\s+(?:list|path)\b|wm\s+(?:size|density)(?:\s+-d)?\s*$|settings\s+get\b|cat\b|ls\b|df\b|du\b|date\b|uptime\b|id\b|which\b|echo\b|pidof\b|ps\b)/i;

const isReadOnly = (tool, command) => tool === "screen" || (tool === "adb" && READ_ONLY.test(command.trim()));

function parseArguments(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export class AgentRunner {
  options;
  aborted = false;
  current = null;

  constructor(options) {
    this.options = options;
  }

  stop() {
    this.aborted = true;
    this.current?.abort();
  }

  get isAborted() {
    return this.aborted;
  }

  async call(messages) {
    this.current = new AbortController();
    try {
      return await streamChatWithTools(this.options.config, messages, {
        tools: TOOL_SCHEMAS,
        signal: this.current.signal,
        onDelta: (delta) => this.options.events.delta?.(delta),
      });
    } finally {
      this.current = null;
    }
  }

  async runChat(history, task) {
    const { events } = this.options;
    this.current = new AbortController();
    try {
      const messages = [...history, userMessage(task)];
      const result = await streamChatWithTools(this.options.config, messages, {
        signal: this.current.signal,
        onDelta: (delta) => events.delta?.(delta),
      });
      events.final?.(result.content.trim() || "(empty response)");
    } catch (error) {
      if (this.aborted)
        events.final?.("Stopped by user");
      else
        events.error?.(errorText(error));
    } finally {
      this.current = null;
      events.done?.();
    }
  }

  async runAgent(history, task) {
    const { events, adb } = this.options;
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history, userMessage(task)];
    try {
      for (let step = 1; step <= MAX_STEPS && !this.aborted; step += 1) {
        events.step?.(step);
        let reply;
        try {
          reply = await this.call(messages);
        } catch (error) {
          if (this.aborted)
            break;
          events.error?.(errorText(error));
          return;
        }
        if (this.aborted)
          break;

        if (!reply.toolCalls.length) {
          events.final?.(reply.content.trim() || "(empty response)");
          return;
        }

        messages.push({ role: "assistant", content: reply.content || "", tool_calls: reply.toolCalls });
        for (const call of reply.toolCalls) {
          if (this.aborted)
            break;
          const name = call.function.name;
          const args = parseArguments(call.function.arguments);
          const command = typeof args?.command === "string" ? args.command.trim() : "";
          let error = "";
          if (!args)
            error = "Invalid JSON arguments. Retry with valid JSON.";
          else if (!TOOL_NAMES.includes(name))
            error = `Unknown tool "${name}".`;
          else if (name === "adb" && !command)
            error = 'The adb tool needs a "command" argument.';

          if (error) {
            messages.push({ role: "tool", tool_call_id: call.id, content: error });
            continue;
          }

          events.command?.(name, command);
          let decision = "execute";
          if (!isReadOnly(name, command) && !this.options.alwaysExecute)
            decision = await this.options.confirm(name, command);
          if (this.aborted || decision === "stop") {
            events.final?.("Stopped by user");
            return;
          }
          if (decision === "reject") {
            const note = "Rejected by user. Propose a different approach or ask what to do.";
            events.result?.(note);
            messages.push({ role: "tool", tool_call_id: call.id, content: note });
            continue;
          }

          const result = await runTool(name, command, adb);
          events.result?.(result.text, result.image);
          messages.push({ role: "tool", tool_call_id: call.id, content: result.text });
          if (result.image)
            messages.push(userMessage("Screenshot from the tool above.", result.image));
        }
      }
      if (this.aborted)
        events.final?.("Stopped by user");
      else
        events.final?.("Reached the step limit. Continue manually or narrow the request.");
    } catch (error) {
      if (this.aborted)
        events.final?.("Stopped by user");
      else
        events.error?.(errorText(error));
    } finally {
      events.done?.();
    }
  }
}
