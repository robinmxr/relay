import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** The small slice of a Postgres client the server uses, so `pg` and PGlite are interchangeable. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Connects to Postgres when `databaseUrl` is set. Otherwise opens an embedded PGlite database
 * stored in `dataDir`, or held in memory when `dataDir` is unset (used by the tests).
 */
export async function openDb(databaseUrl?: string, dataDir?: string): Promise<Db> {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return {
      query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows,
      exec: async (sql) => {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  // PGlite creates its own directory but not missing parents.
  if (dataDir) await mkdir(path.dirname(path.resolve(dataDir)), { recursive: true });
  const lite = dataDir ? new PGlite(dataDir) : new PGlite();
  await lite.waitReady;
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await lite.query<T>(sql, params)).rows,
    exec: async (sql) => {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}

/** Applies each file in ./migrations once, in name order, inside a transaction. */
export async function migrate(db: Db): Promise<void> {
  await db.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const dir = new URL('./migrations/', import.meta.url);
  const names = (await readdir(dir)).filter((n) => /^\d+_[\w-]+\.sql$/.test(n)).sort();
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  for (const name of names) {
    if (done.has(name)) continue;
    const sql = await readFile(new URL(name, dir), 'utf8');
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations (name) values ('${name}');\ncommit;`);
  }
}

export const DEFAULT_JOIN_CODE = 'relay-hq';
export const DEFAULT_CHANNELS: [string, string][] = [
  ['general', 'Company-wide announcements'],
  ['random', 'Anything goes'],
];

/** Ensures the default workspace and its channels exist. Returns the workspace id. */
export async function seed(db: Db): Promise<string> {
  await db.query(`insert into workspaces (name, join_code) values ('Relay HQ', $1) on conflict (join_code) do nothing`, [DEFAULT_JOIN_CODE]);
  const [ws] = await db.query<{ id: string }>('select id from workspaces where join_code = $1', [DEFAULT_JOIN_CODE]);
  await createDefaultChannels(db, ws.id);
  return ws.id;
}

export async function createDefaultChannels(db: Db, workspaceId: string, names = DEFAULT_CHANNELS): Promise<void> {
  for (const [name, topic] of names) {
    await db.query(
      `insert into channels (workspace_id, name, topic)
       select $1::uuid, $2::text, $3::text
       where not exists (select 1 from channels where workspace_id = $1::uuid and lower(name) = $2::text and not is_dm)`,
      [workspaceId, name, topic],
    );
  }
}
