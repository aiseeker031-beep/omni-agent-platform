export type JsonSchema = Record<string, unknown>;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  provider: string;
  execute: (args: Record<string, unknown>, ctx: { userId: string }) => Promise<unknown>;
};
