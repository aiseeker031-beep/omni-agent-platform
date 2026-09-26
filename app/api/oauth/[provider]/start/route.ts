import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { callbackUrl, providerConfig } from "@/lib/oauth";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{provider:string}> }) {
  try {
    const user=await requireUser();
    const {provider}=await context.params;
    const cfg=providerConfig(provider);
    const state=randomToken(24);
    await query(`INSERT INTO oauth_states(state,user_id,provider,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`,[state,user.id,provider]);
    const url=new URL(cfg.authorizeUrl);
    url.searchParams.set('client_id',cfg.clientId);
    url.searchParams.set('redirect_uri',callbackUrl(provider));
    url.searchParams.set('response_type','code');
    url.searchParams.set('state',state);
    url.searchParams.set('scope',cfg.scopes.join(' '));
    for(const [k,v] of Object.entries(cfg.extraAuthParams||{})) url.searchParams.set(k,v);
    return Response.redirect(url);
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:"OAuth start failed"},{status:400});
  }
}
