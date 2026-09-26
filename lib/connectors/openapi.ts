import type { ToolDefinition } from "@/lib/types";
import { fetchJson } from "@/lib/http";

export type OpenApiConfig = {
  specUrl: string;
  baseUrl?: string;
  auth?: { type: "bearer" | "apiKey"; token: string; header?: string };
};

type Spec = { servers?: Array<{url:string}>; paths?: Record<string, Record<string, any>> };

const specCache = new Map<string, { at: number; spec: Spec }>();

async function loadSpec(url: string) {
  const cached = specCache.get(url);
  if (cached && Date.now() - cached.at < 300_000) return cached.spec;
  const { data } = await fetchJson(url);
  const spec = data as Spec;
  if (!spec.paths) throw new Error("OpenAPI document has no paths");
  specCache.set(url, { at: Date.now(), spec });
  return spec;
}

function schemaFor(op: any) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of op.parameters || []) {
    properties[p.name] = { ...(p.schema || { type: "string" }), description: p.description, "x-location": p.in };
    if (p.required) required.push(p.name);
  }
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    properties.body = bodySchema;
    if (op.requestBody.required) required.push("body");
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export async function openApiTools(connectorName: string, config: OpenApiConfig): Promise<ToolDefinition[]> {
  const spec = await loadSpec(config.specUrl);
  const baseUrl = (config.baseUrl || spec.servers?.[0]?.url || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error(`Connector ${connectorName} has no base URL`);
  const tools: ToolDefinition[] = [];

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods || {})) {
      if (!/^(get|post|put|patch|delete)$/i.test(method) || !op || typeof op !== "object") continue;
      const operationId = String(op.operationId || `${method}_${path}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const name = `openapi__${connectorName.replace(/[^a-zA-Z0-9_-]/g,"_")}__${operationId}`;
      tools.push({
        name,
        provider: `openapi:${connectorName}`,
        description: String(op.summary || op.description || `${method.toUpperCase()} ${path}`).slice(0, 500),
        inputSchema: schemaFor(op),
        execute: async (args) => {
          let resolved = path;
          const url = new URL(baseUrl + path);
          for (const p of op.parameters || []) {
            const value = args[p.name];
            if (value === undefined) continue;
            if (p.in === "path") resolved = resolved.replace(`{${p.name}}`, encodeURIComponent(String(value)));
            if (p.in === "query") url.searchParams.set(p.name, String(value));
          }
          const finalUrl = new URL(baseUrl + resolved);
          for (const [k,v] of url.searchParams.entries()) finalUrl.searchParams.set(k,v);
          const headers: Record<string,string> = { Accept: "application/json" };
          if (args.body !== undefined) headers["Content-Type"] = "application/json";
          if (config.auth?.type === "bearer") headers.Authorization = `Bearer ${config.auth.token}`;
          if (config.auth?.type === "apiKey") headers[config.auth.header || "X-API-Key"] = config.auth.token;
          return (await fetchJson(finalUrl.toString(), {
            method: method.toUpperCase(),
            headers,
            body: args.body === undefined ? undefined : JSON.stringify(args.body),
          })).data;
        },
      });
    }
  }
  return tools;
}
