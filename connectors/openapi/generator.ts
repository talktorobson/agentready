// ─── OpenAPI Tool Generator ───────────────────────────────────────
// Converts OpenAPI 3.x operations into agentready tool definitions.

import { z, ZodRawShape } from "zod";
import { AnyToolDef } from "../../src/core/types.js";
import { apiRequest } from "./client.js";
import {
  OpenAPISpec, Operation, Parameter, Schema, Reference,
  HTTP_METHODS, HttpMethod,
  resolve, resolveSchemaDeep, isRef,
} from "./parser.js";

// ─── Config ───────────────────────────────────────────────────────

export interface GeneratorConfig {
  baseUrl: string;
  authType?: "bearer" | "apikey" | "basic";
  authToken?: string;
  authHeader?: string;
  authUser?: string;
  includeTags?: string[];
  excludeOperations?: string[];
}

// ─── Tool Name Generation ─────────────────────────────────────────

function sanitizeName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function nameFromPath(method: string, path: string): string {
  const cleaned = path
    .replace(/\{([^}]+)\}/g, "by_$1")
    .replace(/[^a-zA-Z0-9]/g, "_");
  return sanitizeName(`${method}_${cleaned}`);
}

function toolName(operation: Operation, method: string, path: string): string {
  if (operation.operationId) {
    return sanitizeName(operation.operationId);
  }
  return nameFromPath(method, path);
}

// ─── OpenAPI Schema → Zod ─────────────────────────────────────────

function schemaToZod(spec: OpenAPISpec, schema: Schema | Reference, desc?: string): z.ZodTypeAny {
  const resolved = resolveSchemaDeep(spec, schema);
  const description = desc || resolved.description || "";

  // Enum (string or integer)
  if (resolved.enum && resolved.enum.length > 0) {
    if (resolved.type === "integer" || resolved.type === "number") {
      // Numeric enum → string enum of the stringified values (CLI passes strings)
      const vals = resolved.enum.map(String) as [string, ...string[]];
      const zodEnum = z.enum(vals);
      return description ? zodEnum.describe(description) : zodEnum;
    }
    const zodEnum = z.enum(resolved.enum as [string, ...string[]]);
    return description ? zodEnum.describe(description) : zodEnum;
  }

  // Primitive types
  switch (resolved.type) {
    case "integer":
    case "number": {
      const zodNum = z.number();
      return description ? zodNum.describe(description) : zodNum;
    }
    case "boolean": {
      const zodBool = z.boolean();
      return description ? zodBool.describe(description) : zodBool;
    }
    case "array": {
      // Check item type for better CLI experience
      if (resolved.items) {
        const itemSchema = resolveSchemaDeep(spec, resolved.items);
        if (itemSchema.type === "integer" || itemSchema.type === "number") {
          // Array of numbers — CLI still sends comma-split strings, but describe it
          const zodArr = z.array(z.string());
          const arrDesc = description || "Comma-separated numbers";
          return zodArr.describe(arrDesc);
        }
      }
      // Default: array of strings (framework's zodToJsonSchema limitation)
      const zodArr = z.array(z.string());
      return description ? zodArr.describe(description) : zodArr;
    }
    case "object": {
      // Nested objects → JSON string (framework can't handle nested in MCP schema)
      const objDesc = description
        ? `JSON object: ${description}`
        : "JSON object";
      return z.string().describe(objDesc);
    }
    default: {
      // No type specified (common with composition) — check if it has properties
      if (resolved.properties) {
        const objDesc = description ? `JSON object: ${description}` : "JSON object";
        return z.string().describe(objDesc);
      }
      // Default to string
      const zodStr = z.string();
      return description ? zodStr.describe(description) : zodStr;
    }
  }
}

// ─── Parameter Collection ─────────────────────────────────────────

interface CollectedParam {
  name: string;
  location: "path" | "query" | "header";
  required: boolean;
  zodType: z.ZodTypeAny;
}

function collectParams(
  spec: OpenAPISpec,
  pathParams: (Parameter | Reference)[] | undefined,
  opParams: (Parameter | Reference)[] | undefined,
): CollectedParam[] {
  const params: CollectedParam[] = [];
  const seen = new Set<string>();

  // Operation params override path params
  const allParams = [...(opParams || []), ...(pathParams || [])];

  for (const raw of allParams) {
    const param = resolve<Parameter>(spec, raw);
    const key = `${param.in}:${param.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (param.in === "cookie") continue; // Skip cookie params

    let zodType: z.ZodTypeAny;
    if (param.schema) {
      zodType = schemaToZod(spec, param.schema, param.description);
    } else {
      zodType = param.description
        ? z.string().describe(param.description)
        : z.string();
    }

    params.push({
      name: param.name,
      location: param.in as "path" | "query" | "header",
      required: param.in === "path" ? true : (param.required ?? false),
      zodType,
    });
  }

  return params;
}

// ─── Request Body Handling ────────────────────────────────────────

interface BodyParam {
  name: string;
  required: boolean;
  zodType: z.ZodTypeAny;
}

function collectBodyParams(
  spec: OpenAPISpec,
  requestBody: Operation["requestBody"],
  existingNames: Set<string>,
): { params: BodyParam[]; isFlattened: boolean; isFormEncoded: boolean } {
  if (!requestBody) return { params: [], isFlattened: false, isFormEncoded: false };

  const body = isRef(requestBody)
    ? resolve<{ description?: string; required?: boolean; content: Record<string, { schema?: Schema | Reference }> }>(spec, requestBody)
    : requestBody;

  // Support both JSON and form-urlencoded (Stripe uses form exclusively)
  const contentEntry = body.content["application/json"]
    || body.content["application/x-www-form-urlencoded"];
  if (!contentEntry?.schema) {
    // Unknown content type → single raw body param
    return {
      params: [{
        name: "body",
        required: body.required ?? false,
        zodType: z.string().describe("Request body (raw)"),
      }],
      isFlattened: false,
      isFormEncoded: false,
    };
  }

  const isFormEncoded = !body.content["application/json"] && !!body.content["application/x-www-form-urlencoded"];
  const schema = resolveSchemaDeep(spec, contentEntry.schema);

  // Try to flatten object schemas (including merged allOf results)
  const isObject = schema.type === "object" || (!schema.type && schema.properties);
  if (isObject && schema.properties) {
    const bodyParams: BodyParam[] = [];
    const requiredFields = new Set(schema.required || []);
    let canFlatten = true;

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const resolved = resolveSchemaDeep(spec, propSchema);

      // Check if the property is too complex (nested object with its own properties)
      if (resolved.type === "object" && resolved.properties) {
        canFlatten = false;
        break;
      }

      let paramName = `body_${propName}`;
      // Collision avoidance
      if (existingNames.has(paramName)) {
        paramName = `body_${propName}_req`;
      }

      bodyParams.push({
        name: paramName,
        required: requiredFields.has(propName),
        zodType: schemaToZod(spec, resolved, resolved.description),
      });
    }

    if (canFlatten && bodyParams.length > 0) {
      return { params: bodyParams, isFlattened: true, isFormEncoded };
    }
  }

  // Complex body → single JSON string param
  const desc = schema.description
    ? `Request body (JSON): ${schema.description}`
    : "Request body (JSON string)";

  return {
    params: [{
      name: "body",
      required: body.required ?? false,
      zodType: z.string().describe(desc),
    }],
    isFlattened: false,
    isFormEncoded,
  };
}

// ─── Tool Generation ──────────────────────────────────────────────

export function generateTools(spec: OpenAPISpec, config: GeneratorConfig): AnyToolDef[] {
  const tools: AnyToolDef[] = [];
  const usedNames = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as keyof typeof pathItem] as Operation | undefined;
      if (!operation) continue;
      if (operation.deprecated) continue;

      // Tag filtering
      if (config.includeTags && config.includeTags.length > 0) {
        const opTags = operation.tags || [];
        if (!opTags.some(t => config.includeTags!.includes(t))) continue;
      }

      // Operation exclusion
      if (config.excludeOperations && operation.operationId) {
        if (config.excludeOperations.includes(operation.operationId)) continue;
      }

      // Generate unique name
      let name = toolName(operation, method, path);
      if (usedNames.has(name)) {
        let counter = 2;
        while (usedNames.has(`${name}_${counter}`)) counter++;
        name = `${name}_${counter}`;
      }
      usedNames.add(name);

      // Collect parameters
      const params = collectParams(spec, pathItem.parameters, operation.parameters);
      const paramNames = new Set(params.map(p => p.name));

      // Collect body params
      const { params: bodyParams, isFlattened, isFormEncoded } = collectBodyParams(
        spec, operation.requestBody, paramNames,
      );

      // Build Zod shape
      const shape: ZodRawShape = {};
      for (const p of params) {
        shape[p.name] = p.required ? p.zodType : p.zodType.optional();
      }
      for (const bp of bodyParams) {
        shape[bp.name] = bp.required ? bp.zodType : bp.zodType.optional();
      }

      // Description
      const description = operation.summary
        || operation.description
        || `${method.toUpperCase()} ${path}`;

      // Capture for closure
      const toolPath = path;
      const toolMethod = method;
      const toolConfig = config;
      const toolBodyFlattened = isFlattened;
      const toolFormEncoded = isFormEncoded;
      const toolParams = params;

      const tool: AnyToolDef = {
        name,
        description,
        parameters: z.object(shape),
        async execute(input: Record<string, unknown>) {
          // Interpolate path params
          let resolvedPath = toolPath;
          for (const p of toolParams) {
            if (p.location === "path" && input[p.name] !== undefined) {
              resolvedPath = resolvedPath.replace(
                `{${p.name}}`,
                encodeURIComponent(String(input[p.name])),
              );
            }
          }

          // Collect query params
          const query: Record<string, string> = {};
          for (const p of toolParams) {
            if (p.location === "query" && input[p.name] !== undefined) {
              query[p.name] = String(input[p.name]);
            }
          }

          // Collect headers
          const headers: Record<string, string> = {};
          for (const p of toolParams) {
            if (p.location === "header" && input[p.name] !== undefined) {
              headers[p.name] = String(input[p.name]);
            }
          }

          // Build body
          let body: unknown = undefined;
          if (toolBodyFlattened) {
            const bodyObj: Record<string, unknown> = {};
            for (const bp of bodyParams) {
              if (input[bp.name] !== undefined) {
                const fieldName = bp.name.replace(/^body_/, "").replace(/_req$/, "");
                const val = input[bp.name];
                // Try to parse JSON strings for object fields
                if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
                  try { bodyObj[fieldName] = JSON.parse(val); continue; } catch { /* use as string */ }
                }
                bodyObj[fieldName] = val;
              }
            }
            if (Object.keys(bodyObj).length > 0) body = bodyObj;
          } else if (input.body !== undefined) {
            // Raw JSON body
            try {
              body = JSON.parse(String(input.body));
            } catch {
              body = input.body;
            }
          }

          const result = await apiRequest({
            baseUrl: toolConfig.baseUrl,
            method: toolMethod.toUpperCase(),
            path: resolvedPath,
            query: Object.keys(query).length > 0 ? query : undefined,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            body,
            formEncoded: toolFormEncoded,
            authType: toolConfig.authType,
            authToken: toolConfig.authToken,
            authHeader: toolConfig.authHeader,
            authUser: toolConfig.authUser,
          });

          return { content: JSON.stringify(result, null, 2) };
        },
      };

      tools.push(tool);
    }
  }

  if (tools.length > 50) {
    process.stderr.write(
      `[agentready] Warning: ${tools.length} tools generated. Consider using OPENAPI_INCLUDE_TAGS to filter.\n`,
    );
  }

  return tools;
}
