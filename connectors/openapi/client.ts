// ─── Generic REST API Client ──────────────────────────────────────
// Pure HTTP client for any REST API. Auth and base URL are configurable.

export interface RequestConfig {
  baseUrl: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  authType?: "bearer" | "apikey";
  authToken?: string;
  authHeader?: string;
}

export async function apiRequest(config: RequestConfig): Promise<unknown> {
  // Concatenate baseUrl + path (new URL() with absolute paths drops the base path)
  const base = config.baseUrl.replace(/\/+$/, "");
  const path = config.path.startsWith("/") ? config.path : `/${config.path}`;
  const url = new URL(`${base}${path}`);
  if (config.query) {
    for (const [key, value] of Object.entries(config.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...config.headers,
  };

  // Auth
  if (config.authToken) {
    if (config.authType === "apikey") {
      headers[config.authHeader || "X-API-Key"] = config.authToken;
    } else {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    }
  }

  // Body
  const init: RequestInit = { method: config.method.toUpperCase(), headers };
  if (config.body !== undefined && config.method.toUpperCase() !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(config.body);
  }

  const res = await fetch(url.toString(), init);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${res.statusText} ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
