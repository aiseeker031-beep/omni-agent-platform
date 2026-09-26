import { query } from "@/lib/db";
import { exchangeCode } from "@/lib/oauth";
import { upsertConnection } from "@/lib/connections";
import { appUrl } from "@/lib/providers";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{provider:string}> }) {
  const {provider}=await context.params;
  try {
    const url=new URL(req.url);
    const code=url.searchParams.get('code');
    const state=url.searchParams.get('state');
    if(!code||!state) throw new Error(url.searchParams.get('error')||'Missing OAuth code/state');
    const result=await query<{user_id:string}>(`DELETE FROM oauth_states WHERE state=$1 AND provider=$2 AND expires_at>now() RETURNING user_id`,[state,provider]);
    const row=result.rows[0];
    if(!row) throw new Error('OAuth state is invalid or expired');
    const credentials=await exchangeCode(provider,code);
    await upsertConnection(row.user_id,provider,'default',credentials,{});
    return Response.redirect(`${appUrl()}/?connected=${encodeURIComponent(provider)}`);
  } catch(error) {
    const message=encodeURIComponent(error instanceof Error?error.message:'OAuth failed');
    return Response.redirect(`${appUrl()}/?oauth_error=${message}`);
  }
}
