import crypto from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

const COOKIE = "omni_session";
const TTL_DAYS = 30;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  return expectedBuf.length === actual.length && crypto.timingSafeEqual(actual, expectedBuf);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000);
  await query(
    `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`,
    [sha256(token), userId, expiresAt],
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
  jar.set(COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const result = await query<{ id: string; email: string }>(
    `SELECT u.id,u.email
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > now()
     LIMIT 1`,
    [sha256(token)],
  );
  return result.rows[0] ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
