import { defineTool, defineConnector, z } from "../../src/core/types.js";
import * as github from "./client.js";

// ─── Tool: get_repo ──────────────────────────────────────────────

const getRepo = defineTool({
  name: "get_repo",
  description: "Get repository details including stars, forks, language, and description.",
  parameters: z.object({
    owner: z.string().describe("Repository owner (user or org)"),
    repo: z.string().describe("Repository name"),
  }),
  async execute({ owner, repo }) {
    const result = await github.getRepo(owner, repo);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: list_issues ───────────────────────────────────────────

const listIssues = defineTool({
  name: "list_issues",
  description: "List issues for a repository, optionally filtered by state and labels.",
  parameters: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    state: z.enum(["open", "closed", "all"]).optional().describe("Issue state filter (default: open)"),
    labels: z.string().optional().describe("Comma-separated label names to filter by"),
    per_page: z.number().optional().describe("Results per page (default: 30, max: 100)"),
  }),
  async execute({ owner, repo, state, labels, per_page }) {
    const result = await github.listIssues(owner, repo, state, labels, per_page);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: create_issue ──────────────────────────────────────────

const createIssue = defineTool({
  name: "create_issue",
  description: "Create a new issue in a repository. Returns the created issue with its number and URL.",
  parameters: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    title: z.string().describe("Issue title"),
    body: z.string().optional().describe("Issue body (Markdown)"),
    labels: z.string().optional().describe("Comma-separated label names to apply"),
  }),
  async execute({ owner, repo, title, body, labels }) {
    const labelList = labels ? labels.split(",").map(l => l.trim()) : undefined;
    const result = await github.createIssue(owner, repo, title, body, labelList);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: search_code ───────────────────────────────────────────

const searchCode = defineTool({
  name: "search_code",
  description: "Search code across GitHub repositories. Use qualifiers like 'repo:owner/name' or 'language:typescript' in the query.",
  parameters: z.object({
    query: z.string().describe("Search query (supports GitHub code search qualifiers)"),
    per_page: z.number().optional().describe("Results per page (default: 20, max: 100)"),
  }),
  async execute({ query, per_page }) {
    const result = await github.searchCode(query, per_page);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: list_pull_requests ────────────────────────────────────

const listPullRequests = defineTool({
  name: "list_pull_requests",
  description: "List pull requests for a repository, optionally filtered by state.",
  parameters: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    state: z.enum(["open", "closed", "all"]).optional().describe("PR state filter (default: open)"),
    per_page: z.number().optional().describe("Results per page (default: 30, max: 100)"),
  }),
  async execute({ owner, repo, state, per_page }) {
    const result = await github.listPullRequests(owner, repo, state, per_page);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Connector Definition ────────────────────────────────────────

export const githubConnector = defineConnector({
  name: "github",
  description: "GitHub connector. Access repos, issues, PRs, and code search via the GitHub REST API.",
  version: "0.1.0",
  env: [
    { name: "GITHUB_TOKEN", description: "GitHub personal access token (classic or fine-grained)", required: true },
  ],
  tools: [getRepo, listIssues, createIssue, searchCode, listPullRequests],
});
