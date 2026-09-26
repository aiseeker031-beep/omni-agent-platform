import { OAUTH_PROVIDERS, appUrl } from "@/lib/providers";
import { fetchJson } from "@/lib/http";
import { getConnection, upsertConnection, type ConnectionCredentials } from "@/lib/connections";

export function providerConfig(provider: string) {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error("Unsupported OAuth provider");
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`${cfg.label} OAuth app is not configured`);
  return { ...cfg, clientId, clientSecret };
}

export function callbackUrl(provider: string) {
  return `${appUrl()}/api/oauth/${provider}/callback`;
}

export async function exchangeCode(provider: string, code: string) {
  const cfg = providerConfig(provider);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: callbackUrl(provider),
    grant_type: "authorization_code",
  });
  const headers: HeadersInit = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const { data } = await fetchJson(cfg.tokenUrl, { method: "POST", headers, body });
  const token = data as Record<string, unknown>;
  if (token.error) throw new Error(String(token.error_description || token.error));
  if (!token.access_token) throw new Error("OAuth provider returned no access token");
  const expiresIn = Number(token.expires_in || 0);
  return {
    ...token,
    access_token: String(token.access_token),
    refresh_token: token.refresh_token ? String(token.refresh_token) : undefined,
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  } as ConnectionCredentials;
}

export async function getAccessToken(userId: string, provider: string) {
  const connection = await getConnection(userId, provider);
  if (!connection) throw new Error(`${provider} is not connected`);
  const creds = connection.credentials;
  if (!creds.expires_at || creds.expires_at > Date.now() + 60_000 || !creds.refresh_token) return creds.access_token;

  const cfg = providerConfig(provider);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });
  const { data } = await fetchJson(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const refreshed = data as Record<string, unknown>;
  const next: ConnectionCredentials = {
    ...creds,
    ...refreshed,
    access_token: String(refreshed.access_token || creds.access_token),
    refresh_token: String(refreshed.refresh_token || creds.refresh_token),
    expires_at: refreshed.expires_in ? Date.now() + Number(refreshed.expires_in) * 1000 : creds.expires_at,
  };
  await upsertConnection(userId, provider, "default", next, connection.metadata);
  return next.access_token;
}
