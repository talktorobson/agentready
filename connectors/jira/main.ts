#!/usr/bin/env node

// ─── Jira Connector Entry Point ────────────────────────────────────
// Run as CLI:  node dist/connectors/jira/main.js search_issues --jql "project = SDT"
// Run as MCP:  node dist/connectors/jira/main.js --mcp

import { run } from "../../src/index.js";
import { jiraConnector } from "./index.js";

run(jiraConnector).catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
