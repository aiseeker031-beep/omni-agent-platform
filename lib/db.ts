import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  pool = new Pool({
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
  });
  return pool;
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS connections (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider text NOT NULL,
        label text NOT NULL,
        encrypted_credentials text NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, provider, label)
      );
      CREATE TABLE IF NOT EXISTS connectors (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('openapi','mcp')),
        encrypted_config text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, name)
      );
      CREATE TABLE IF NOT EXISTS oauth_states (
        state text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
      CREATE INDEX IF NOT EXISTS idx_connectors_user ON connectors(user_id);
    `);
  })();
  return schemaPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await ensureSchema();
  return getPool().query<T>(text, params);
}
