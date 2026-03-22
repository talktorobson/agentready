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
  const isMcpFlag = process.argv.includes("--mcp");
  const mode = process.env.AGENTREADY_MODE
    || (isMcpFlag ? "mcp" : "cli");

  if (mode === "mcp") {
    // Remove --mcp flag so it doesn't interfere with downstream parsing
    process.argv = process.argv.filter(a => a !== "--mcp");
    await runMcp(connector);
  } else {
    await runCli(connector);
  }
}
