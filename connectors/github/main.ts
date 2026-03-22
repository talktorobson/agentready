#!/usr/bin/env node

// ─── GitHub Connector Entry Point ─────────────────────────────────
// Run as CLI:  node dist/connectors/github/main.js list_issues --owner anthropics --repo anthropic-sdk-python
// Run as MCP:  node dist/connectors/github/main.js --mcp

import { run } from "../../src/index.js";
import { githubConnector } from "./index.js";

run(githubConnector).catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
