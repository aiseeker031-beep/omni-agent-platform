import { requireUser } from "@/lib/auth";
import { deleteConnection, listConnections } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET() {
  try { const user=await requireUser(); return Response.json({connections:await listConnections(user.id)}); }
  catch(error){ return Response.json({error:error instanceof Error?error.message:"Failed"},{status:401}); }
}

export async function DELETE(req: Request) {
  try { const user=await requireUser(); const {id}=await req.json(); await deleteConnection(user.id,String(id)); return Response.json({ok:true}); }
  catch(error){ return Response.json({error:error instanceof Error?error.message:"Failed"},{status:400}); }
}
