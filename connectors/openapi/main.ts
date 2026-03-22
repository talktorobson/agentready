#!/usr/bin/env node

// ─── OpenAPI Connector Entry Point ────────────────────────────────
// Point at any OpenAPI 3.x spec and get CLI + MCP tools automatically.
//
// Run as CLI:  OPENAPI_SPEC_PATH=./petstore.json node dist/connectors/openapi/main.js --help
// Run as MCP:  OPENAPI_SPEC_PATH=./petstore.json node dist/connectors/openapi/main.js --mcp

import { readFileSync } from "node:fs";
import { run } from "../../src/index.js";
import { OpenAPISpec } from "./parser.js";
import { buildConnector } from "./index.js";

async function loadSpec(): Promise<OpenAPISpec> {
  const specPath = process.env.OPENAPI_SPEC_PATH;
  if (!specPath) {
    process.stderr.write("Error: OPENAPI_SPEC_PATH environment variable is required.\n");
    process.stderr.write("  Set it to a local file path or URL to an OpenAPI 3.x spec.\n\n");
    process.exit(1);
  }

  let raw: string;

  if (specPath.startsWith("http://") || specPath.startsWith("https://")) {
    const res = await fetch(specPath);
    if (!res.ok) {
      throw new Error(`Failed to fetch spec from ${specPath}: ${res.status} ${res.statusText}`);
    }
    raw = await res.text();
  } else {
    raw = readFileSync(specPath, "utf-8");
  }

  // Try JSON first, then YAML
  try {
    return JSON.parse(raw) as OpenAPISpec;
  } catch {
    // Try YAML
    try {
      const { parse: parseYaml } = await import("yaml");
      return parseYaml(raw) as OpenAPISpec;
    } catch (yamlErr) {
      throw new Error(
        `Failed to parse spec as JSON or YAML. Install 'yaml' package for YAML support.\n${yamlErr}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const spec = await loadSpec();
  const connector = buildConnector(spec);

  process.stderr.write(
    `[agentready] Loaded "${spec.info.title}" v${spec.info.version} — ${connector.tools.length} tools generated\n`,
  );

  await run(connector);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
