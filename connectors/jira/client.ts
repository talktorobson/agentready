// ─── Jira API Client ───────────────────────────────────────────────
// Pure HTTP client. No framework dependencies. Used by tool handlers.

const getBaseUrl = () => process.env.JIRA_BASE_URL ?? "https://jira.example.com";
const getToken = () => process.env.JIRA_TOKEN ?? "";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${getBaseUrl()}/rest/api/2${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers(), ...options?.headers } });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status}: ${res.statusText} ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Public API ────────────────────────────────────────────────────

export async function getIssue(issueKey: string): Promise<unknown> {
  return request(`/issue/${issueKey}`);
}

export async function searchIssues(jql: string, maxResults = 20, fields?: string[]): Promise<unknown> {
  const body: Record<string, unknown> = { jql, maxResults };
  if (fields) body.fields = fields;
  return request("/search", { method: "POST", body: JSON.stringify(body) });
}

export async function createIssue(
  projectKey: string,
  issueType: string,
  summary: string,
  description?: string,
  extra?: Record<string, unknown>
): Promise<unknown> {
  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { name: issueType },
    summary,
  };
  if (description) fields.description = description;
  if (extra) Object.assign(fields, extra);

  return request("/issue", { method: "POST", body: JSON.stringify({ fields }) });
}

export async function updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<unknown> {
  await request(`/issue/${issueKey}`, { method: "PUT", body: JSON.stringify({ fields }) });
  return { success: true, key: issueKey };
}

export async function addComment(issueKey: string, body: string): Promise<unknown> {
  return request(`/issue/${issueKey}/comment`, { method: "POST", body: JSON.stringify({ body }) });
}

export async function transitionIssue(issueKey: string, transitionId: string): Promise<unknown> {
  await request(`/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
  return { success: true, key: issueKey, transitionId };
}

export async function getTransitions(issueKey: string): Promise<unknown> {
  return request(`/issue/${issueKey}/transitions`);
}
