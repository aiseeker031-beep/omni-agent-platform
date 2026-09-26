import { query } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { builtinTools } from "@/lib/connectors/builtin";
import { openApiTools, type OpenApiConfig } from "@/lib/connectors/openapi";
import { mcpTools, type McpConfig } from "@/lib/connectors/mcp";
import type { ToolDefinition } from "@/lib/types";

export async function getAllTools(userId: string) {
  const result = await query<{name:string;kind:"openapi"|"mcp";encrypted_config:string}>(
    `SELECT name,kind,encrypted_config FROM connectors WHERE user_id=$1 ORDER BY name`, [userId],
  );
  const dynamic: ToolDefinition[] = [];
  for (const row of result.rows) {
    try {
      if (row.kind === "openapi") dynamic.push(...await openApiTools(row.name, decryptJson<OpenApiConfig>(row.encrypted_config)));
      if (row.kind === "mcp") dynamic.push(...await mcpTools(row.name, decryptJson<McpConfig>(row.encrypted_config)));
    } catch (error) {
      dynamic.push({
        name: `connector_error__${row.name.replace(/[^a-zA-Z0-9_-]/g,"_")}`,
        provider: `${row.kind}:${row.name}`,
        description: `Connector failed to load: ${error instanceof Error ? error.message : "unknown error"}`,
        inputSchema: { type:"object", properties:{}, additionalProperties:false },
        execute: async () => { throw error; },
      });
    }
  }
  return [...builtinTools, ...dynamic];
}

function tokens(text: string) {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 1));
}

export async function searchTools(userId: string, q: string, limit = 12) {
  const all = await getAllTools(userId);
  const needle = tokens(q);
  return all
    .map((tool) => {
      const hay = tokens(`${tool.name} ${tool.provider} ${tool.description}`);
      let score = 0;
      for (const t of needle) if (hay.has(t)) score += 3;
      for (const t of needle) if (tool.name.toLowerCase().includes(t)) score += 2;
      return { tool, score };
    })
    .sort((a,b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map(({tool}) => ({ name:tool.name, provider:tool.provider, description:tool.description, inputSchema:tool.inputSchema }));
}

export async function executeTool(userId: string, name: string, args: Record<string, unknown>) {
  const all = await getAllTools(userId);
  const tool = all.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args, { userId });
}
