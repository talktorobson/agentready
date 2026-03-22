// ─── OpenAPI Connector Builder ────────────────────────────────────
// Reads config from env, generates tools from spec, returns ConnectorDef.

import { ConnectorDef } from "../../src/core/types.js";
import { OpenAPISpec } from "./parser.js";
import { generateTools, GeneratorConfig } from "./generator.js";

export function buildConnector(spec: OpenAPISpec): ConnectorDef {
  // Resolve base URL: env override > spec servers > fallback
  const baseUrl = process.env.OPENAPI_BASE_URL
    || spec.servers?.[0]?.url
    || "http://localhost:8080";

  // Auth config
  const authType = (process.env.OPENAPI_AUTH_TYPE as "bearer" | "apikey") || "bearer";
  const authToken = process.env.OPENAPI_AUTH_TOKEN;
  const authHeader = process.env.OPENAPI_AUTH_HEADER;

  // Filtering
  const includeTags = process.env.OPENAPI_INCLUDE_TAGS
    ? process.env.OPENAPI_INCLUDE_TAGS.split(",").map(t => t.trim())
    : undefined;
  const excludeOperations = process.env.OPENAPI_EXCLUDE_OPERATIONS
    ? process.env.OPENAPI_EXCLUDE_OPERATIONS.split(",").map(o => o.trim())
    : undefined;

  // Connector name
  const name = process.env.OPENAPI_CONNECTOR_NAME
    || spec.info.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    || "openapi";

  const config: GeneratorConfig = {
    baseUrl,
    authType: authToken ? authType : undefined,
    authToken,
    authHeader,
    includeTags,
    excludeOperations,
  };

  const tools = generateTools(spec, config);

  return {
    name,
    description: spec.info.description || `OpenAPI connector for ${spec.info.title}`,
    version: spec.info.version || "0.1.0",
    env: [
      { name: "OPENAPI_SPEC_PATH", description: "Path or URL to OpenAPI 3.x spec (JSON or YAML)", required: true },
      { name: "OPENAPI_BASE_URL", description: `API base URL (default: ${baseUrl})`, required: false, default: baseUrl },
      { name: "OPENAPI_AUTH_TOKEN", description: "Bearer token or API key", required: false },
      { name: "OPENAPI_AUTH_TYPE", description: "Auth type: bearer or apikey (default: bearer)", required: false, default: "bearer" },
      { name: "OPENAPI_AUTH_HEADER", description: "Header name for apikey auth (default: X-API-Key)", required: false, default: "X-API-Key" },
      { name: "OPENAPI_INCLUDE_TAGS", description: "Comma-separated tags to include", required: false },
      { name: "OPENAPI_EXCLUDE_OPERATIONS", description: "Comma-separated operationIds to exclude", required: false },
      { name: "OPENAPI_CONNECTOR_NAME", description: "Override connector name", required: false },
    ],
    tools,
  };
}
