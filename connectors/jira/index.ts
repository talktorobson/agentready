import { defineTool, defineConnector, z } from "../../src/core/types.js";
import * as jira from "./client.js";

// ─── Tool: get_issue ───────────────────────────────────────────────

const getIssue = defineTool({
  name: "get_issue",
  description: "Get a Jira issue by key (e.g. SDT-1234). Returns summary, status, assignee, description, and comments.",
  parameters: z.object({
    issue_key: z.string().describe("Jira issue key, e.g. SDT-1234"),
  }),
  async execute({ issue_key }) {
    const issue = await jira.getIssue(issue_key);
    return { content: JSON.stringify(issue, null, 2) };
  },
});

// ─── Tool: search_issues ──────────────────────────────────────────

const searchIssues = defineTool({
  name: "search_issues",
  description: "Search Jira issues using JQL query. Returns matching issues with key fields.",
  parameters: z.object({
    jql: z.string().describe("JQL query string, e.g. project = SDT AND status = Open"),
    max_results: z.number().optional().describe("Maximum results to return (default 20)"),
    fields: z.string().optional().describe("Comma-separated field names to include"),
  }),
  async execute({ jql, max_results, fields }) {
    const fieldList = fields ? fields.split(",").map(f => f.trim()) : undefined;
    const result = await jira.searchIssues(jql, max_results ?? 20, fieldList);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: create_issue ───────────────────────────────────────────

const createIssue = defineTool({
  name: "create_issue",
  description: "Create a new Jira issue in a project. Returns the created issue key.",
  parameters: z.object({
    project: z.string().describe("Project key, e.g. SDT"),
    type: z.string().describe("Issue type: Task, Bug, Story, Epic"),
    summary: z.string().describe("Issue title/summary"),
    description: z.string().optional().describe("Issue description (Jira wiki markup)"),
  }),
  async execute({ project, type, summary, description }) {
    const result = await jira.createIssue(project, type, summary, description);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: update_issue ───────────────────────────────────────────

const updateIssue = defineTool({
  name: "update_issue",
  description: "Update fields on an existing Jira issue.",
  parameters: z.object({
    issue_key: z.string().describe("Jira issue key, e.g. SDT-1234"),
    summary: z.string().optional().describe("New summary"),
    description: z.string().optional().describe("New description"),
    assignee: z.string().optional().describe("Assignee username"),
    priority: z.string().optional().describe("Priority name: Highest, High, Medium, Low, Lowest"),
  }),
  async execute({ issue_key, summary, description, assignee, priority }) {
    const fields: Record<string, unknown> = {};
    if (summary) fields.summary = summary;
    if (description) fields.description = description;
    if (assignee) fields.assignee = { name: assignee };
    if (priority) fields.priority = { name: priority };

    const result = await jira.updateIssue(issue_key, fields);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: add_comment ────────────────────────────────────────────

const addComment = defineTool({
  name: "add_comment",
  description: "Add a comment to a Jira issue.",
  parameters: z.object({
    issue_key: z.string().describe("Jira issue key, e.g. SDT-1234"),
    body: z.string().describe("Comment body text (Jira wiki markup)"),
  }),
  async execute({ issue_key, body }) {
    const result = await jira.addComment(issue_key, body);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: transition_issue ───────────────────────────────────────

const transitionIssue = defineTool({
  name: "transition_issue",
  description: "Transition a Jira issue to a new status. Use get_transitions first to find valid transition IDs.",
  parameters: z.object({
    issue_key: z.string().describe("Jira issue key, e.g. SDT-1234"),
    transition_id: z.string().describe("Transition ID (get from get_transitions)"),
  }),
  async execute({ issue_key, transition_id }) {
    const result = await jira.transitionIssue(issue_key, transition_id);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Tool: get_transitions ────────────────────────────────────────

const getTransitions = defineTool({
  name: "get_transitions",
  description: "List available status transitions for a Jira issue.",
  parameters: z.object({
    issue_key: z.string().describe("Jira issue key, e.g. SDT-1234"),
  }),
  async execute({ issue_key }) {
    const result = await jira.getTransitions(issue_key);
    return { content: JSON.stringify(result, null, 2) };
  },
});

// ─── Connector Definition ─────────────────────────────────────────

export const jiraConnector = defineConnector({
  name: "jira",
  description: "Jira Server/Data Center connector. Works with on-prem Jira instances using Bearer token auth.",
  version: "0.1.0",
  env: [
    { name: "JIRA_BASE_URL", description: "Jira server URL (e.g. https://jira.example.com)", required: true },
    { name: "JIRA_TOKEN", description: "Personal access token for authentication", required: true },
  ],
  tools: [getIssue, searchIssues, createIssue, updateIssue, addComment, transitionIssue, getTransitions],
});
