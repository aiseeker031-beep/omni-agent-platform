export type OAuthProvider = {
  slug: string;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
  clientAuth?: "body" | "basic";
};

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    slug: "google",
    label: "Google Workspace",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/calendar",
    ],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    clientAuth: "body",
  },
  github: {
    slug: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    scopes: ["repo", "read:user", "user:email", "workflow"],
    clientAuth: "body",
  },
  slack: {
    slug: "slack",
    label: "Slack",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    scopes: ["channels:read", "channels:history", "chat:write", "users:read", "files:read"],
    clientAuth: "body",
  },
};

export function appUrl() {
  return (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
