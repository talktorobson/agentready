import { z, ZodObject, ZodRawShape } from "zod";

// ─── Tool Definition ───────────────────────────────────────────────
// This is the SINGLE source of truth. Define once, get CLI + MCP.

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolDef<T extends ZodRawShape = ZodRawShape> {
  /** Tool name: lowercase, snake_case. Used as CLI subcommand and MCP tool name. */
  name: string;
  /** Human-readable description. Shown in --help and MCP tool listing. */
  description: string;
  /** Zod schema for parameters. Drives CLI flags AND MCP input schema. */
  parameters: ZodObject<T>;
  /** The actual business logic. Same function runs in CLI and MCP. */
  execute: (params: z.infer<ZodObject<T>>) => Promise<ToolResult>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any>;

// ─── Connector Definition ──────────────────────────────────────────
// A connector groups related tools under one namespace.

export interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface ConnectorDef {
  /** Connector name: lowercase, kebab-case. Used as CLI command prefix. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Version string */
  version: string;
  /** Required environment variables */
  env: EnvVar[];
  /** Tools this connector provides */
  tools: AnyToolDef[];
  /** Optional setup function (validate config, init clients, etc.) */
  setup?: () => Promise<void>;
}

// ─── Builder API ───────────────────────────────────────────────────

export function defineTool<T extends ZodRawShape>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

export function defineConnector(def: ConnectorDef): ConnectorDef {
  return def;
}

// ─── Zod to JSON Schema (minimal, for MCP) ─────────────────────────

export function zodToJsonSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, zodType] of Object.entries(shape)) {
    const prop: Record<string, unknown> = {};
    const innerType = unwrapOptional(zodType as z.ZodTypeAny);

    if (innerType instanceof z.ZodString) {
      prop.type = "string";
    } else if (innerType instanceof z.ZodNumber) {
      prop.type = "number";
    } else if (innerType instanceof z.ZodBoolean) {
      prop.type = "boolean";
    } else if (innerType instanceof z.ZodArray) {
      prop.type = "array";
      prop.items = { type: "string" };
    } else if (innerType instanceof z.ZodEnum) {
      prop.type = "string";
      prop.enum = innerType._def.values;
    } else {
      prop.type = "string";
    }

    if (innerType._def?.description) {
      prop.description = innerType._def.description;
    } else if ((zodType as z.ZodTypeAny)._def?.description) {
      prop.description = (zodType as z.ZodTypeAny)._def.description;
    }

    properties[key] = prop;

    if (!isOptional(zodType as z.ZodTypeAny)) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isOptional(t: z.ZodTypeAny): boolean {
  return t instanceof z.ZodOptional || t instanceof z.ZodDefault;
}

function unwrapOptional(t: z.ZodTypeAny): z.ZodTypeAny {
  if (t instanceof z.ZodOptional) return t._def.innerType;
  if (t instanceof z.ZodDefault) return t._def.innerType;
  return t;
}

// ─── Re-export zod for convenience ─────────────────────────────────
export { z };
