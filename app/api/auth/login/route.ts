import { createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();
    const result = await query<{id:string;email:string;password_hash:string}>(`SELECT id,email,password_hash FROM users WHERE email=$1 LIMIT 1`, [normalized]);
    const user = result.rows[0];
    if (!user || !verifyPassword(String(password || ""), user.password_hash)) return Response.json({error:"Invalid email or password"},{status:401});
    await createSession(user.id);
    return Response.json({ user: { id:user.id, email:user.email } });
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "Login failed"},{status:500});
  }
}
