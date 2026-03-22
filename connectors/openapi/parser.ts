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

// ─── $ref Resolution ──────────────────────────────────────────────

export function resolveRef<T>(spec: OpenAPISpec, ref: string): T {
  // Handle #/components/schemas/Foo style refs
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

export function resolve<T>(spec: OpenAPISpec, obj: T | Reference): T {
  if (isRef(obj)) {
    const resolved = resolveRef<T>(spec, obj.$ref);
    // Recursively resolve in case of chained refs
    if (isRef(resolved)) {
      return resolve(spec, resolved);
    }
    return resolved;
  }
  return obj;
}

// ─── Schema Resolution ────────────────────────────────────────────

export function resolveSchema(spec: OpenAPISpec, schema: Schema | Reference): Schema {
  const resolved = resolve<Schema>(spec, schema);

  // Resolve items if present
  if (resolved.items && isRef(resolved.items)) {
    resolved.items = resolve<Schema>(spec, resolved.items);
  }

  return resolved;
}

// ─── HTTP Methods ─────────────────────────────────────────────────

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
export type HttpMethod = typeof HTTP_METHODS[number];
