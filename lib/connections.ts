import crypto from "node:crypto";
import { query } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";

export type ConnectionCredentials = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
};

export async function upsertConnection(userId: string, provider: string, label: string, credentials: ConnectionCredentials, metadata: Record<string, unknown> = {}) {
  await query(
    `INSERT INTO connections(id,user_id,provider,label,encrypted_credentials,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT(user_id,provider,label)
     DO UPDATE SET encrypted_credentials=EXCLUDED.encrypted_credentials, metadata=EXCLUDED.metadata, updated_at=now()`,
    [crypto.randomUUID(), userId, provider, label, encryptJson(credentials), JSON.stringify(metadata)],
  );
}

export async function getConnection(userId: string, provider: string, label = "default") {
  const result = await query<{ encrypted_credentials: string; metadata: Record<string, unknown> }>(
    `SELECT encrypted_credentials,metadata FROM connections WHERE user_id=$1 AND provider=$2 AND label=$3 LIMIT 1`,
    [userId, provider, label],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { credentials: decryptJson<ConnectionCredentials>(row.encrypted_credentials), metadata: row.metadata || {} };
}

export async function listConnections(userId: string) {
  const result = await query<{ id:string; provider:string; label:string; metadata:Record<string,unknown>; created_at:string; updated_at:string }>(
    `SELECT id,provider,label,metadata,created_at,updated_at FROM connections WHERE user_id=$1 ORDER BY updated_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function deleteConnection(userId: string, id: string) {
  await query(`DELETE FROM connections WHERE id=$1 AND user_id=$2`, [id, userId]);
}
