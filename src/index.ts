export { defineTool, defineConnector, zodToJsonSchema, z } from "./core/types.js";
export type { ToolDef, AnyToolDef, ToolResult, ConnectorDef, EnvVar } from "./core/types.js";
export { runCli } from "./cli/runner.js";
export { runMcp } from "./mcp/runner.js";

// ─── Dual Runner ───────────────────────────────────────────────────
// Runs CLI or MCP based on how the process was invoked.

import { ConnectorDef } from "./core/types.js";
import { runCli } from "./cli/runner.js";
import { runMcp } from "./mcp/runner.js";

export async function run(connector: ConnectorDef): Promise<void> {
  // Detect mode from argv or environment
  const args = process.argv.slice(2);
  const mode = process.env.AGENTREADY_MODE
    || (args[0] === "--mcp" ? "mcp" : "cli");

  if (mode === "mcp") {
    // Remove --mcp flag before passing to MCP runner
    const mcpIndex = args.indexOf("--mcp");
    if (mcpIndex !== -1) process.argv.splice(mcpIndex + 2, 1);
    await runMcp(connector);
  } else {
    await runCli(connector);
  }
}
