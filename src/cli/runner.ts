import { ConnectorDef, AnyToolDef } from "../core/types.js";
import { z, ZodObject, ZodRawShape } from "zod";

// ─── CLI Runner ────────────────────────────────────────────────────
// Takes a ConnectorDef, parses process.argv, runs the matching tool.
// Zero dependencies beyond zod. No CLI framework needed.

interface ParsedArgs {
  command: string | undefined;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node + script
  const command = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  const flags: Record<string, string | boolean> = {};

  for (let i = command ? 1 : 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return { command, flags };
}

function coerceValue(value: string | boolean, zodType: z.ZodTypeAny): unknown {
  const inner = unwrap(zodType);

  if (inner instanceof z.ZodNumber) {
    return Number(value);
  }
  if (inner instanceof z.ZodBoolean) {
    if (value === true || value === "true") return true;
    if (value === "false") return false;
    return Boolean(value);
  }
  if (inner instanceof z.ZodArray) {
    return typeof value === "string" ? value.split(",") : [value];
  }
  return value;
}

function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  if (t instanceof z.ZodOptional) return unwrap(t._def.innerType);
  if (t instanceof z.ZodDefault) return unwrap(t._def.innerType);
  return t;
}

function isOptional(t: z.ZodTypeAny): boolean {
  return t instanceof z.ZodOptional || t instanceof z.ZodDefault;
}

function printHelp(connector: ConnectorDef): void {
  const w = process.stderr;
  w.write(`\n  ${connector.name} v${connector.version}\n`);
  w.write(`  ${connector.description}\n\n`);
  w.write(`  Usage: ${connector.name} <command> [flags]\n\n`);
  w.write(`  Commands:\n`);
  for (const tool of connector.tools) {
    w.write(`    ${tool.name.padEnd(28)} ${tool.description}\n`);
  }
  w.write(`\n  Global flags:\n`);
  w.write(`    --help                       Show this help\n`);
  w.write(`    --format <json|text>         Output format (default: json)\n`);
  w.write(`\n  Environment variables:\n`);
  for (const env of connector.env) {
    const req = env.required ? "(required)" : `(default: ${env.default})`;
    w.write(`    ${env.name.padEnd(28)} ${env.description} ${req}\n`);
  }
  w.write(`\n`);
}

function printToolHelp(tool: AnyToolDef): void {
  const w = process.stderr;
  const shape = (tool.parameters as ZodObject<ZodRawShape>).shape;

  w.write(`\n  ${tool.name}\n`);
  w.write(`  ${tool.description}\n\n`);
  w.write(`  Flags:\n`);
  for (const [key, zodType] of Object.entries(shape)) {
    const inner = unwrap(zodType as z.ZodTypeAny);
    const opt = isOptional(zodType as z.ZodTypeAny);
    let typeStr = "string";
    if (inner instanceof z.ZodNumber) typeStr = "number";
    if (inner instanceof z.ZodBoolean) typeStr = "boolean";
    if (inner instanceof z.ZodArray) typeStr = "string[]";
    if (inner instanceof z.ZodEnum) typeStr = (inner._def.values as string[]).join("|");

    const desc = (zodType as z.ZodTypeAny)._def?.description
      || inner._def?.description
      || "";
    const reqStr = opt ? "(optional)" : "(required)";

    w.write(`    --${key.padEnd(24)} <${typeStr}> ${desc} ${reqStr}\n`);
  }
  w.write(`\n`);
}

export async function runCli(connector: ConnectorDef): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  // Help or no command (show before env check)
  if (!command || flags.help === true) {
    printHelp(connector);
    process.exit(0);
  }

  // Check env vars
  for (const env of connector.env) {
    if (env.required && !process.env[env.name]) {
      process.stderr.write(`Error: Missing required environment variable: ${env.name}\n`);
      process.stderr.write(`  ${env.description}\n\n`);
      process.exit(1);
    }
  }

  // Find tool
  const tool = connector.tools.find(t => t.name === command || t.name.replace(/_/g, "-") === command);
  if (!tool) {
    process.stderr.write(`Error: Unknown command "${command}"\n`);
    process.stderr.write(`Run "${connector.name} --help" for available commands.\n\n`);
    process.exit(1);
  }

  // Tool help (already handled above in the !command check)


  // Run setup if defined
  if (connector.setup) {
    await connector.setup();
  }

  // Coerce and validate params
  const shape = (tool.parameters as ZodObject<ZodRawShape>).shape;
  const params: Record<string, unknown> = {};

  for (const [key, zodType] of Object.entries(shape)) {
    const kebab = key.replace(/_/g, "-");
    const rawValue = flags[key] ?? flags[kebab];
    if (rawValue !== undefined) {
      params[key] = coerceValue(rawValue, zodType as z.ZodTypeAny);
    }
  }

  const parsed = tool.parameters.safeParse(params);
  if (!parsed.success) {
    process.stderr.write(`Validation error:\n`);
    for (const issue of parsed.error.issues) {
      process.stderr.write(`  --${issue.path.join(".")}: ${issue.message}\n`);
    }
    process.stderr.write(`\nRun "${connector.name} ${command} --help" for flag details.\n\n`);
    process.exit(1);
  }

  // Execute
  try {
    const result = await tool.execute(parsed.data);

    const format = flags.format as string || "json";
    if (format === "json") {
      // Try to parse content as JSON for clean output
      try {
        const jsonContent = JSON.parse(result.content);
        process.stdout.write(JSON.stringify(jsonContent, null, 2) + "\n");
      } catch {
        process.stdout.write(JSON.stringify({ result: result.content, error: result.isError ?? false }) + "\n");
      }
    } else {
      process.stdout.write(result.content + "\n");
    }

    process.exit(result.isError ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error executing ${command}: ${message}\n`);
    process.exit(1);
  }
}
