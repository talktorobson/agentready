# AgentReady

**Define tools once. Get both CLI and MCP server.**

A framework for building AI agent tooling with dual interfaces: CLI for terminal agents (Claude Code, Codex, Gemini CLI) and MCP for browser agents, widgets, and multi-tenant environments.

## Why both?

Terminal agents and browser agents consume tools differently.

| | CLI | MCP |
|---|---|---|
| **Token cost** | 10-32x cheaper (Scalekit benchmark) | High schema overhead |
| **Reliability** | 100% (runs locally) | 72% (network dependent) |
| **Composability** | Pipes, chains, loops | Single tool calls |
| **Auth model** | Inherits user credentials | OAuth, RBAC, audit logs |
| **Discovery** | Agent needs to know tools exist | Dynamic tool listing |

The answer is not one or the other. It is both, from one source of truth.

## Quick Start

```bash
npm install agentready
```

### Define a connector

```typescript
import { defineConnector, defineTool, z, run } from "agentready";

const greet = defineTool({
  name: "greet",
  description: "Say hello to someone",
  parameters: z.object({
    name: z.string().describe("Person to greet"),
  }),
  async execute({ name }) {
    return { content: JSON.stringify({ message: `Hello, ${name}!` }) };
  },
});

const myConnector = defineConnector({
  name: "my-tool",
  description: "Example connector",
  version: "1.0.0",
  env: [],
  tools: [greet],
});

run(myConnector);
```

### Run as CLI

```bash
node my-tool.js greet --name "World"
# {"message": "Hello, World!"}

# Supports kebab-case flags
node my-tool.js greet --name "World" --format text

# Pipe into other tools
node my-tool.js greet --name "World" | jq .message
```

### Run as MCP

```bash
node my-tool.js --mcp

# Or set env
AGENTREADY_MODE=mcp node my-tool.js
```

### Configure with Claude Desktop

```json
{
  "mcpServers": {
    "my-tool": {
      "command": "node",
      "args": ["/path/to/my-tool.js", "--mcp"]
    }
  }
}
```

### Configure with Claude Code

```bash
claude mcp add my-tool node /path/to/my-tool.js -- --mcp
```

## Built-in Connectors

### Jira (Server / Data Center)

Works with on-prem Jira instances using Bearer token auth. 7 tools: get_issue, search_issues, create_issue, update_issue, add_comment, transition_issue, get_transitions.

```bash
# CLI mode
export JIRA_BASE_URL=https://jira.example.com
export JIRA_TOKEN=your-token

node connectors/jira/main.js search_issues --jql "project = SDT AND status = Open"
node connectors/jira/main.js create_issue --project SDT --type Task --summary "Fix the thing"
node connectors/jira/main.js get_issue --issue-key SDT-1234 | jq '.fields.status.name'

# MCP mode
node connectors/jira/main.js --mcp
```

## Framework API

### `defineTool(def)`

Define a single tool with name, description, zod parameters, and execute function.

```typescript
const myTool = defineTool({
  name: "search_orders",                     // snake_case (also works as kebab in CLI)
  description: "Search orders by status",     // shown in --help and MCP listing
  parameters: z.object({                      // drives CLI flags AND MCP input schema
    status: z.enum(["open", "closed", "pending"]).describe("Order status filter"),
    limit: z.number().optional().describe("Max results"),
  }),
  async execute({ status, limit }) {          // same function, both interfaces
    const results = await db.query(status, limit ?? 20);
    return { content: JSON.stringify(results) };
  },
});
```

### `defineConnector(def)`

Group tools under a namespace with shared config.

```typescript
const connector = defineConnector({
  name: "my-erp",
  description: "ERP system connector",
  version: "0.1.0",
  env: [
    { name: "ERP_URL", description: "ERP base URL", required: true },
    { name: "ERP_TOKEN", description: "API token", required: true },
  ],
  tools: [searchOrders, createOrder, getOrder],
  setup: async () => { /* validate connection, warm cache, etc. */ },
});
```

### `run(connector)`

Auto-detect mode and start. Pass `--mcp` flag or set `AGENTREADY_MODE=mcp` for MCP server. Otherwise runs as CLI.

### Parameter mapping

| Zod type | CLI flag | MCP schema |
|---|---|---|
| `z.string()` | `--flag value` | `{ type: "string" }` |
| `z.number()` | `--flag 42` (auto-coerced) | `{ type: "number" }` |
| `z.boolean()` | `--flag` (true) or `--flag false` | `{ type: "boolean" }` |
| `z.enum(["a","b"])` | `--flag a` | `{ type: "string", enum: ["a","b"] }` |
| `z.array(z.string())` | `--flag a,b,c` (comma-split) | `{ type: "array" }` |
| `.optional()` | flag is optional | field not in `required` |
| `.describe("...")` | shown in `--help` | shown in MCP description |

## Architecture

```
  your-connector.ts
        |
  defineConnector({ tools: [...] })
        |
    run(connector)
        |
   ┌----+----┐
   |         |
 CLI       MCP
  |          |
 argv    stdio/http
  |          |
  parse     schema
  flags     inject
  |          |
  +----+-----+
       |
  tool.execute(params)
       |
    business logic
    (shared, single implementation)
```

## Building a new connector

1. Create `connectors/my-system/client.ts` with pure HTTP/SDK calls
2. Create `connectors/my-system/index.ts` with tool definitions using `defineTool`
3. Create `connectors/my-system/main.ts` with `run(myConnector)`
4. Build and test:
   ```bash
   npx tsc
   node dist/connectors/my-system/main.js --help
   node dist/connectors/my-system/main.js --mcp
   ```

## Design principles

1. **One definition, two interfaces.** Never duplicate business logic.
2. **Agent-first CLI.** JSON output by default. Strict args. Reliable exit codes. Composable with pipes.
3. **MCP when you need it.** Auth, discovery, multi-tenant. Not for everything.
4. **Zero CLI framework deps.** Just zod + process.argv. No commander, no yargs.
5. **TypeScript native.** Full type safety from definition to execution.

## License

MIT
