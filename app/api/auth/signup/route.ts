import crypto from "node:crypto";
import { createSession, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return Response.json({error:"Enter a valid email"},{status:400});
    if (String(password || "").length < 10) return Response.json({error:"Password must be at least 10 characters"},{status:400});
    const id = crypto.randomUUID();
    await query(`INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)`, [id, normalized, hashPassword(String(password))]);
    await createSession(id);
    return Response.json({ user: { id, email: normalized } });
  } catch (error: any) {
    if (String(error?.message || "").includes("users_email_key")) return Response.json({error:"Email is already registered"},{status:409});
    return Response.json({error:error instanceof Error ? error.message : "Signup failed"},{status:500});
  }
}
