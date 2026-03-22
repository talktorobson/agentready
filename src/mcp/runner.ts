import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConnectorDef, zodToJsonSchema } from "../core/types.js";
import { ZodObject, ZodRawShape } from "zod";

// ─── MCP Runner ────────────────────────────────────────────────────
// Takes a ConnectorDef, registers each tool as MCP tool, starts server.
// Uses stdio transport (works with Claude Desktop and Claude Code).

export async function runMcp(connector: ConnectorDef): Promise<void> {
  // Check env vars
  for (const env of connector.env) {
    if (env.required && !process.env[env.name]) {
      process.stderr.write(`Error: Missing required environment variable: ${env.name}\n`);
      process.exit(1);
    }
  }

  // Run setup if defined
  if (connector.setup) {
    await connector.setup();
  }

  const server = new McpServer({
    name: connector.name,
    version: connector.version,
  });

  // Register each tool
  for (const tool of connector.tools) {
    const jsonSchema = zodToJsonSchema(tool.parameters as ZodObject<ZodRawShape>);

    server.tool(
      tool.name,
      tool.description,
      jsonSchema as Record<string, unknown>,
      async (params: Record<string, unknown>) => {
        const parsed = tool.parameters.safeParse(params);
        if (!parsed.success) {
          return {
            content: [{
              type: "text" as const,
              text: `Validation error: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
            }],
            isError: true,
          };
        }

        try {
          const result = await tool.execute(parsed.data);
          return {
            content: [{ type: "text" as const, text: result.content }],
            isError: result.isError ?? false,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[agentready] MCP server "${connector.name}" v${connector.version} running (${connector.tools.length} tools)\n`);
}
