// ─── GitHub API Client ─────────────────────────────────────────────
// Pure HTTP client for GitHub REST API v3. No framework dependencies.

const BASE_URL = "https://api.github.com";
const getToken = () => process.env.GITHUB_TOKEN ?? "";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers(), ...options?.headers } });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${res.statusText} ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Public API ────────────────────────────────────────────────────

export async function getRepo(owner: string, repo: string): Promise<unknown> {
  return request(`/repos/${owner}/${repo}`);
}

export async function listIssues(
  owner: string,
  repo: string,
  state?: string,
  labels?: string,
  perPage?: number,
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("state", state ?? "open");
  params.set("per_page", String(perPage ?? 30));
  if (labels) params.set("labels", labels);
  return request(`/repos/${owner}/${repo}/issues?${params}`);
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[],
): Promise<unknown> {
  const payload: Record<string, unknown> = { title };
  if (body) payload.body = body;
  if (labels?.length) payload.labels = labels;
  return request(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function searchCode(query: string, perPage?: number): Promise<unknown> {
  const params = new URLSearchParams({ q: query, per_page: String(perPage ?? 20) });
  return request(`/search/code?${params}`);
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state?: string,
  perPage?: number,
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("state", state ?? "open");
  params.set("per_page", String(perPage ?? 30));
  return request(`/repos/${owner}/${repo}/pulls?${params}`);
}
