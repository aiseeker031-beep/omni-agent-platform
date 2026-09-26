export const runtime = "nodejs";
export async function GET() {
  return Response.json({
    ok: true,
    independent: true,
    composio: false,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    encryptionConfigured: Boolean(process.env.APP_ENCRYPTION_KEY),
    aiConfigured: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL),
    oauth: {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      slack: Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),
    },
  }, { headers: { "Cache-Control":"no-store" } });
}
