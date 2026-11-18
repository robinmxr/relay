import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** The small slice of a Postgres client the server uses, so `pg` and PGlite are interchangeable. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /**
   * Runs `fn` in a transaction on one connection and commits, or rolls back if it throws.
   * Use the `q` it is given for every statement inside; the outer `Db` may be another connection
   * (Postgres) or wait for the transaction to finish (PGlite). Publish events after it returns.
   */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const noNesting = (): never => {
  throw new Error('transactions do not nest');
};

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
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const result = await fn({
            query: async (sql, params) => (await client.query(sql, params as unknown[])).rows,
            exec: async (sql) => {
              await client.query(sql);
            },
            tx: noNesting,
            close: async () => {},
          });
          await client.query('commit');
          return result;
        } catch (err) {
          await client.query('rollback').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
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
    // PGlite has one connection; it holds other queries until the transaction ends.
    tx: (fn) =>
      lite.transaction((t) =>
        fn({
          query: async <T>(sql: string, params?: unknown[]) => (await t.query<T>(sql, params)).rows,
          exec: async (sql) => {
            await t.exec(sql);
          },
          tx: noNesting,
          close: async () => {},
        }),
      ),
    close: () => lite.close(),
  };
}

/**
 * Applies each file in ./migrations once, in name order, each in its own transaction. An advisory
 * lock makes processes that start together take turns, so a migration never runs twice.
 */
export async function migrate(db: Db): Promise<void> {
  const dir = new URL('./migrations/', import.meta.url);
  const names = (await readdir(dir)).filter((n) => /^\d+_[\w-]+\.sql$/.test(n)).sort();
  for (const name of names) {
    const sql = await readFile(new URL(name, dir), 'utf8');
    await db.tx(async (q) => {
      await q.query('select pg_advisory_xact_lock(7243001)');
      await q.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
      if ((await q.query('select 1 from schema_migrations where name = $1', [name])).length) return;
      await q.exec(sql);
      await q.query('insert into schema_migrations (name) values ($1)', [name]);
    });
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
