import { executeTool, searchTools } from "@/lib/tool-registry";
import { assertPublicHttpsUrl } from "@/lib/security";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type ModelConfig = { baseURL?: string; apiKey?: string; model?: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ApiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_tools",
    description: "Search the user's available native, OpenAPI and MCP tools. Always call this before executing an unfamiliar external action.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Describe the capability needed, including the app/service." },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 12 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const EXECUTE_TOOL = {
  type: "function",
  function: {
    name: "execute_tool",
    description: "Execute one exact tool returned by search_tools.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        arguments: { type: "object", additionalProperties: true },
      },
      required: ["name", "arguments"],
      additionalProperties: false,
    },
  },
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function config(override?: ModelConfig) {
  const baseURL = clean(override?.baseURL) || clean(process.env.AI_BASE_URL);
  const apiKey = clean(override?.apiKey) || clean(process.env.AI_API_KEY);
  const model = clean(override?.model) || clean(process.env.AI_MODEL);
  if (!baseURL || !apiKey || !model) throw new Error("AI provider is not configured");
  return { baseURL: baseURL.replace(/\/$/, ""), apiKey, model };
}

async function completion(messages: ApiMessage[], override?: ModelConfig) {
  const ai = config(override);
  const endpoint = /\/chat\/completions$/.test(ai.baseURL) ? ai.baseURL : `${ai.baseURL}/chat/completions`;
  if (process.env.NODE_ENV === "production") await assertPublicHttpsUrl(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ai.model,
      messages,
      tools: [SEARCH_TOOL, EXECUTE_TOOL],
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { throw new Error(`AI endpoint returned non-JSON: ${text.slice(0,500)}`); }
  if (!res.ok) throw new Error(`AI endpoint ${res.status}: ${payload?.error?.message || text.slice(0,500)}`);
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error("AI endpoint returned no message");
  return message as { role:"assistant"; content?:string|null; tool_calls?:ToolCall[] };
}

function toolResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 45_000 ? text.slice(0,45_000) + "\n...[truncated]" : text;
}

export async function runAgent(userId: string, history: ChatMessage[], override?: ModelConfig) {
  const now = new Date().toISOString();
  const messages: ApiMessage[] = [
    {
      role: "system",
      content: `You are Omni, a self-hosted general-purpose AI agent. Current UTC time: ${now}.

You have two meta-tools: search_tools and execute_tool. Search first for external app capabilities, then execute the exact returned tool name. Do not invent tool names or arguments.
If a required app is not connected, explain which connection is missing. Never claim an external action succeeded unless execute_tool returned success.
For destructive, publishing, financial, permission-changing, or irreversible operations, only execute when the user's latest request clearly authorizes that action.
Keep final answers concise and include useful IDs/links returned by tools.`,
    },
    ...history.slice(-30).map((m) => ({ role: m.role, content: m.content } as ApiMessage)),
  ];

  const trace: Array<{ tool: string; input: unknown; output?: unknown; error?: string }> = [];

  for (let step = 0; step < 12; step++) {
    const assistant = await completion(messages, override);
    messages.push({ role: "assistant", content: assistant.content || null, tool_calls: assistant.tool_calls });
    const calls = assistant.tool_calls || [];
    if (!calls.length) return { content: assistant.content || "", trace };

    for (const call of calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
      try {
        let result: unknown;
        if (call.function.name === "search_tools") {
          result = await searchTools(userId, String(args.query || ""), Number(args.limit || 12));
        } else if (call.function.name === "execute_tool") {
          result = await executeTool(userId, String(args.name || ""), (args.arguments || {}) as Record<string,unknown>);
        } else {
          throw new Error(`Unknown meta-tool ${call.function.name}`);
        }
        trace.push({ tool: call.function.name, input: args, output: result });
        messages.push({ role: "tool", tool_call_id: call.id, content: toolResult(result) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        trace.push({ tool: call.function.name, input: args, error: message });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: message }) });
      }
    }
  }
  throw new Error("Agent exceeded the maximum tool-call steps");
}
