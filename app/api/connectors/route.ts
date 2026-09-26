import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { query } from "@/lib/db";
import { assertPublicHttpsUrl } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user=await requireUser();
    const result=await query<{id:string;name:string;kind:string;created_at:string;updated_at:string}>(`SELECT id,name,kind,created_at,updated_at FROM connectors WHERE user_id=$1 ORDER BY name`,[user.id]);
    return Response.json({connectors:result.rows});
  } catch(error){ return Response.json({error:error instanceof Error?error.message:"Failed"},{status:401}); }
}

export async function POST(req: Request) {
  try {
    const user=await requireUser();
    const {name,kind,config}=await req.json();
    const safeName=String(name||"").trim();
    if (!safeName || safeName.length>60) return Response.json({error:"Invalid connector name"},{status:400});
    if (!['openapi','mcp'].includes(kind)) return Response.json({error:"kind must be openapi or mcp"},{status:400});
    if (kind==='openapi') await assertPublicHttpsUrl(String(config?.specUrl||""));
    if (kind==='mcp') await assertPublicHttpsUrl(String(config?.url||""));
    await query(`INSERT INTO connectors(id,user_id,name,kind,encrypted_config) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,name) DO UPDATE SET kind=EXCLUDED.kind,encrypted_config=EXCLUDED.encrypted_config,updated_at=now()`,[crypto.randomUUID(),user.id,safeName,kind,encryptJson(config||{})]);
    return Response.json({ok:true});
  } catch(error){ return Response.json({error:error instanceof Error?error.message:"Failed"},{status:500}); }
}

export async function DELETE(req: Request) {
  try { const user=await requireUser(); const {id}=await req.json(); await query(`DELETE FROM connectors WHERE id=$1 AND user_id=$2`,[String(id),user.id]); return Response.json({ok:true}); }
  catch(error){ return Response.json({error:error instanceof Error?error.message:"Failed"},{status:400}); }
}
