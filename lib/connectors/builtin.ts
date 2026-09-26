import { getAccessToken } from "@/lib/oauth";
import { fetchJson } from "@/lib/http";
import type { ToolDefinition } from "@/lib/types";

function requiredObject(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

async function googleFetch(userId: string, url: string, init: RequestInit = {}) {
  const token = await getAccessToken(userId, "google");
  return fetchJson(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
}

async function githubFetch(userId: string, url: string, init: RequestInit = {}) {
  const token = await getAccessToken(userId, "github");
  return fetchJson(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function slackFetch(userId: string, endpoint: string, body?: Record<string, unknown>) {
  const token = await getAccessToken(userId, "slack");
  const { data } = await fetchJson(`https://slack.com/api/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = data as Record<string, unknown>;
  if (payload.ok === false) throw new Error(`Slack: ${String(payload.error || "unknown error")}`);
  return payload;
}

function gmailRaw(to: string, subject: string, body: string) {
  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(mime).toString("base64url");
}

export const builtinTools: ToolDefinition[] = [
  {
    name: "gmail_list_messages",
    provider: "google",
    description: "List Gmail messages matching a Gmail search query. Use for inbox, unread, sender, date and subject searches.",
    inputSchema: requiredObject({
      query: { type: "string", description: "Gmail search query, e.g. is:unread newer_than:1d" },
      maxResults: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    }, ["query"]),
    execute: async (args, ctx) => {
      const max = Math.min(50, Math.max(1, Number(args.maxResults || 10)));
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", String(args.query));
      url.searchParams.set("maxResults", String(max));
      const { data } = await googleFetch(ctx.userId, url.toString());
      const list = (data as { messages?: Array<{id:string}> }).messages || [];
      const details = await Promise.all(list.slice(0, max).map(async ({ id }) => {
        const { data: message } = await googleFetch(ctx.userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
        const m = message as any;
        const headers = Object.fromEntries((m.payload?.headers || []).map((h:any) => [String(h.name).toLowerCase(), h.value]));
        return { id, threadId: m.threadId, snippet: m.snippet, headers };
      }));
      return { messages: details };
    },
  },
  {
    name: "gmail_send_email",
    provider: "google",
    description: "Send a plain-text Gmail email from the connected Google account.",
    inputSchema: requiredObject({
      to: { type: "string" }, subject: { type: "string" }, body: { type: "string" },
    }, ["to", "subject", "body"]),
    execute: async (args, ctx) => {
      const { data } = await googleFetch(ctx.userId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: gmailRaw(String(args.to), String(args.subject), String(args.body)) }),
      });
      return data;
    },
  },
  {
    name: "drive_list_files",
    provider: "google",
    description: "Search or list files in Google Drive.",
    inputSchema: requiredObject({
      query: { type: "string", description: "Drive API q expression. Leave empty to list recent non-trashed files." },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    }),
    execute: async (args, ctx) => {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, Number(args.pageSize || 20)))));
      url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName,emailAddress))");
      url.searchParams.set("orderBy", "modifiedTime desc");
      url.searchParams.set("q", String(args.query || "trashed = false"));
      return (await googleFetch(ctx.userId, url.toString())).data;
    },
  },
  {
    name: "calendar_list_events",
    provider: "google",
    description: "List Google Calendar events in a time range.",
    inputSchema: requiredObject({
      timeMin: { type: "string", description: "RFC3339 start time" },
      timeMax: { type: "string", description: "RFC3339 end time" },
      maxResults: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    }, ["timeMin", "timeMax"]),
    execute: async (args, ctx) => {
      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      url.searchParams.set("timeMin", String(args.timeMin));
      url.searchParams.set("timeMax", String(args.timeMax));
      url.searchParams.set("maxResults", String(Math.min(50, Number(args.maxResults || 20))));
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      return (await googleFetch(ctx.userId, url.toString())).data;
    },
  },
  {
    name: "calendar_create_event",
    provider: "google",
    description: "Create a Google Calendar event on the primary calendar.",
    inputSchema: requiredObject({
      summary: { type: "string" },
      start: { type: "string", description: "RFC3339 start date-time" },
      end: { type: "string", description: "RFC3339 end date-time" },
      description: { type: "string" },
      attendees: { type: "array", items: { type: "string", format: "email" } },
      timeZone: { type: "string", default: "UTC" },
    }, ["summary", "start", "end"]),
    execute: async (args, ctx) => {
      const payload = {
        summary: String(args.summary),
        description: args.description ? String(args.description) : undefined,
        start: { dateTime: String(args.start), timeZone: String(args.timeZone || "UTC") },
        end: { dateTime: String(args.end), timeZone: String(args.timeZone || "UTC") },
        attendees: Array.isArray(args.attendees) ? args.attendees.map((email) => ({ email: String(email) })) : undefined,
      };
      return (await googleFetch(ctx.userId, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })).data;
    },
  },
  {
    name: "github_list_repositories",
    provider: "github",
    description: "List repositories accessible to the connected GitHub account.",
    inputSchema: requiredObject({
      visibility: { type: "string", enum: ["all", "public", "private"], default: "all" },
      perPage: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    }),
    execute: async (args, ctx) => {
      const url = new URL("https://api.github.com/user/repos");
      url.searchParams.set("visibility", String(args.visibility || "all"));
      url.searchParams.set("per_page", String(Math.min(100, Number(args.perPage || 30))));
      url.searchParams.set("sort", "updated");
      return (await githubFetch(ctx.userId, url.toString())).data;
    },
  },
  {
    name: "github_create_issue",
    provider: "github",
    description: "Create a GitHub issue in a repository.",
    inputSchema: requiredObject({ owner: {type:"string"}, repo: {type:"string"}, title: {type:"string"}, body: {type:"string"} }, ["owner","repo","title"]),
    execute: async (args, ctx) => (await githubFetch(ctx.userId, `https://api.github.com/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: args.title, body: args.body || "" }),
    })).data,
  },
  {
    name: "github_search_issues",
    provider: "github",
    description: "Search GitHub issues and pull requests using GitHub search syntax.",
    inputSchema: requiredObject({ query: {type:"string"}, perPage: {type:"integer", minimum:1, maximum:100, default:20} }, ["query"]),
    execute: async (args, ctx) => {
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set("q", String(args.query));
      url.searchParams.set("per_page", String(Math.min(100, Number(args.perPage || 20))));
      return (await githubFetch(ctx.userId, url.toString())).data;
    },
  },
  {
    name: "slack_list_channels",
    provider: "slack",
    description: "List public Slack channels available to the connected account.",
    inputSchema: requiredObject({}),
    execute: async (_args, ctx) => slackFetch(ctx.userId, "conversations.list?limit=200"),
  },
  {
    name: "slack_channel_history",
    provider: "slack",
    description: "Fetch recent messages from a Slack channel by channel ID.",
    inputSchema: requiredObject({ channel: {type:"string"}, limit: {type:"integer", minimum:1, maximum:100, default:20} }, ["channel"]),
    execute: async (args, ctx) => {
      const token = await getAccessToken(ctx.userId, "slack");
      const url = new URL("https://slack.com/api/conversations.history");
      url.searchParams.set("channel", String(args.channel));
      url.searchParams.set("limit", String(Math.min(100, Number(args.limit || 20))));
      const { data } = await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const payload = data as Record<string, unknown>;
      if (payload.ok === false) throw new Error(`Slack: ${String(payload.error || "unknown error")}`);
      return payload;
    },
  },
  {
    name: "slack_send_message",
    provider: "slack",
    description: "Send a message to a Slack channel.",
    inputSchema: requiredObject({ channel: {type:"string"}, text: {type:"string"} }, ["channel","text"]),
    execute: async (args, ctx) => slackFetch(ctx.userId, "chat.postMessage", { channel: args.channel, text: args.text }),
  },
];
