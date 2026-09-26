# Omni Agent Platform

Independent, self-hosted AI agent + integration platform. It does **not** use Composio, Zapier, Pipedream, or another integration aggregator at runtime.

## Architecture

```text
User -> Omni Agent -> search_tools -> private Tool Registry -> execute_tool
                                   |-> Native OAuth connectors
                                   |-> OpenAPI importers
                                   |-> Remote MCP servers

Credential Vault -> encrypted tokens in your Postgres database
AI Layer          -> any OpenAI-compatible endpoint
```

The model receives only two stable meta-tools (`search_tools`, `execute_tool`). This keeps model context small even when the registry contains thousands of actions.

## Included native integrations

- Google Workspace: Gmail search/send, Drive file search, Calendar read/create
- GitHub: repositories, issue search, issue creation
- Slack: channel listing/history and message sending
- OpenAPI: import operations dynamically from any HTTPS OpenAPI JSON endpoint
- MCP: connect remote Streamable HTTP MCP servers through the official MCP TypeScript client

Adding more first-party integrations means adding connector definitions/actions—not changing the agent loop.

## What "independent" means

There is no `COMPOSIO_API_KEY`, `@composio/*` package, Composio backend call, or Composio OAuth flow in this project. OAuth credentials are issued to OAuth apps that **you create with Google/GitHub/Slack** and are encrypted in your own database.

## Environment

Copy `.env.example` to `.env.local`.

Required for production:

```env
DATABASE_URL=postgresql://...
APP_ENCRYPTION_KEY=a-long-random-secret
PUBLIC_APP_URL=https://your-domain.vercel.app
AI_BASE_URL=https://your-openai-compatible-endpoint.example/v1
AI_API_KEY=...
AI_MODEL=...
```

OAuth integrations are optional. Add only the apps you want enabled:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
```

Callback URLs to register with providers:

```text
https://YOUR_DOMAIN/api/oauth/google/callback
https://YOUR_DOMAIN/api/oauth/github/callback
https://YOUR_DOMAIN/api/oauth/slack/callback
```

## Database

No migration command is required for the first version. The server runs idempotent `CREATE TABLE IF NOT EXIST``statements when it first accesses the database.

A free Postgres service such as Neon can be used with Vercel.

## Run locally

```bash
npm install
npm run dev
```

## Vercel

Deploy the repository root. Add the environment variables above. Node.js 22+ is required.

## Security notes

- Passwords use Node `scrypt` with a per-password random salt.
- Session tokens are random and only their SHA-256 hashes are stored in Postgres.
- Connected-account credentials and custom connector configurations are encrypted with AES-256-GCM before storage.
- OAuth state values are one-time and expire after 10 minutes.
- Secrets entered in the frontend AI settings are not written to localStorage; server environment variables are preferable for shared deployments.

## Scaling toward 1000+ integrations

You do not need 1000 hard-coded SDK packages. Use three paths:

1. Native connectors for the highest-volume apps where precise UX matters.
2. OpenAPI specs for REST services that publish machine-readable APIs.
3. MCP servers for services exposing MCP directly.

The tool registry normalizes all three into one `ToolDefinition` shape and the model discovers them through `search_tools`.
