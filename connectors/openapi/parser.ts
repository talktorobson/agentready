// ─── OpenAPI 3.x Spec Parser ──────────────────────────────────────
// Minimal types and $ref resolution for the subset we need.

// ─── Types ────────────────────────────────────────────────────────

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    parameters?: Record<string, Parameter>;
    requestBodies?: Record<string, RequestBody>;
  };
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  head?: Operation;
  options?: Operation;
  parameters?: (Parameter | Reference)[];
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: (Parameter | Reference)[];
  requestBody?: RequestBody | Reference;
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: Schema;
  description?: string;
}

export interface Schema {
  type?: string;
  format?: string;
  enum?: string[];
  items?: Schema | Reference;
  properties?: Record<string, Schema | Reference>;
  required?: string[];
  description?: string;
  $ref?: string;
  default?: unknown;
  allOf?: (Schema | Reference)[];
  oneOf?: (Schema | Reference)[];
  anyOf?: (Schema | Reference)[];
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema?: Schema | Reference }>;
}

export interface Reference {
  $ref: string;
}

// ─── Type Guards ──────────────────────────────────────────────────

export function isRef(obj: unknown): obj is Reference {
  return typeof obj === "object" && obj !== null && "$ref" in obj;
}

// ─── $ref Resolution (cycle-safe, depth-limited) ─────────────────

const MAX_REF_DEPTH = 20;

export function resolveRef<T>(spec: OpenAPISpec, ref: string): T {
  const path = ref.replace(/^#\//, "").split("/");
  let current: unknown = spec;
  for (const segment of path) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new Error(`Cannot resolve $ref: ${ref}`);
    }
  }
  return current as T;
}

export function resolve<T>(spec: OpenAPISpec, obj: T | Reference, seen?: Set<string>): T {
  if (isRef(obj)) {
    const refPath = obj.$ref;
    const visited = seen || new Set<string>();
    if (visited.has(refPath) || visited.size > MAX_REF_DEPTH) {
      // Cycle or too deep — return a stub
      return { type: "string", description: `(circular ref: ${refPath})` } as T;
    }
    visited.add(refPath);
    const resolved = resolveRef<T>(spec, refPath);
    if (isRef(resolved)) {
      return resolve(spec, resolved, visited);
    }
    return resolved;
  }
  return obj;
}

// ─── Schema Composition (allOf / oneOf / anyOf) ──────────────────

function mergeAllOf(spec: OpenAPISpec, schemas: (Schema | Reference)[]): Schema {
  const merged: Schema = { type: "object", properties: {}, required: [] };
  for (const s of schemas) {
    const resolved = resolveSchemaDeep(spec, s);
    if (resolved.properties) {
      merged.properties = { ...merged.properties, ...resolved.properties };
    }
    if (resolved.required) {
      merged.required = [...(merged.required || []), ...resolved.required];
    }
    if (resolved.description && !merged.description) {
      merged.description = resolved.description;
    }
    // Inherit type if set
    if (resolved.type && resolved.type !== "object") {
      merged.type = resolved.type;
    }
  }
  if (merged.required && merged.required.length === 0) delete merged.required;
  return merged;
}

// ─── Schema Resolution (deep, handles composition) ───────────────

export function resolveSchemaDeep(spec: OpenAPISpec, schema: Schema | Reference, depth = 0): Schema {
  if (depth > MAX_REF_DEPTH) {
    return { type: "string", description: "(schema too deeply nested)" };
  }

  const resolved = resolve<Schema>(spec, schema);

  // Handle allOf — merge all schemas into one
  if (resolved.allOf && resolved.allOf.length > 0) {
    const merged = mergeAllOf(spec, resolved.allOf);
    // Also merge any direct properties from the parent schema
    if (resolved.properties) {
      merged.properties = { ...merged.properties, ...resolved.properties };
    }
    if (resolved.required) {
      merged.required = [...(merged.required || []), ...resolved.required];
    }
    if (resolved.description) merged.description = resolved.description;
    return merged;
  }

  // Handle oneOf/anyOf — use the first option (best effort)
  if (resolved.oneOf && resolved.oneOf.length > 0) {
    const first = resolveSchemaDeep(spec, resolved.oneOf[0], depth + 1);
    if (resolved.description) first.description = resolved.description;
    return first;
  }
  if (resolved.anyOf && resolved.anyOf.length > 0) {
    // Filter out null types (common pattern: anyOf with null for nullable)
    const nonNull = resolved.anyOf.filter(s => {
      const r = resolve<Schema>(spec, s);
      return r.type !== "null";
    });
    const pick = nonNull.length > 0 ? nonNull[0] : resolved.anyOf[0];
    const first = resolveSchemaDeep(spec, pick, depth + 1);
    if (resolved.description) first.description = resolved.description;
    return first;
  }

  // Resolve items ref if present
  if (resolved.items && isRef(resolved.items)) {
    resolved.items = resolve<Schema>(spec, resolved.items);
  }

  return resolved;
}

// Backwards compat alias
export function resolveSchema(spec: OpenAPISpec, schema: Schema | Reference): Schema {
  return resolveSchemaDeep(spec, schema);
}

// ─── HTTP Methods ─────────────────────────────────────────────────

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
export type HttpMethod = typeof HTTP_METHODS[number];
