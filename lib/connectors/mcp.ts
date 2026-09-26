import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { ToolDefinition } from "@/lib/types";

export type McpConfig = { url: string; headers?: Record<string,string> };

async function connect(config: McpConfig) {
  const client = new Client(
    { name: "omni-agent-platform", version: "0.1.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: config.headers || {} },
  });
  await client.connect(transport);
  return { client, transport };
}

export async function mcpTools(connectorName: string, config: McpConfig): Promise<ToolDefinition[]> {
  const { client, transport } = await connect(config);
  try {
    const { tools } = await client.listTools();
    return tools.map((tool: any) => ({
      name: `mcp__${connectorName.replace(/[^a-zA-Z0-9_-]/g,"_")}__${String(tool.name).replace(/[^a-zA-Z0-9_-]/g,"_")}`,
      provider: `mcp:${connectorName}`,
      description: String(tool.description || tool.name),
      inputSchema: (tool.inputSchema || { type: "object", properties: {} }) as Record<string, unknown>,
      execute: async (args: Record<string, unknown>) => {
        const live = await connect(config);
        try {
          return await live.client.callTool({ name: tool.name, arguments: args });
        } finally {
          await live.transport.terminateSession().catch(() => {});
          await live.client.close().catch(() => {});
        }
      },
    }));
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}
