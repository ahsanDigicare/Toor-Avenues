import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

// One read-only query interface over two backends:
//   • Turso (hosted SQLite) when TURSO_DATABASE_URL is set — used on Vercel, whose
//     filesystem is read-only and which cannot hold the 125 MB listing file.
//   • The local file written by scripts/ddf-sync.mjs (.data/ddf.sqlite) otherwise.
// Both run the same SQLite SQL, so the queries in listings.ts work unchanged.

export type SqlValue = string | number | null;

export type Database = {
  all<T>(sql: string, ...args: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, ...args: SqlValue[]): Promise<T | undefined>;
};

let opened: Promise<Database | null> | null = null;

async function openTurso(url: string): Promise<Database> {
  // The /web build talks HTTP only (no native binary), so it bundles cleanly for serverless.
  const { createClient } = await import("@libsql/client/web");
  const client = createClient({ url: url.replace(/^libsql:\/\//, "https://"), authToken: process.env.TURSO_AUTH_TOKEN });
  const all = async <T,>(sql: string, ...args: SqlValue[]) => {
    const result = await client.execute({ sql, args });
    // Copy into plain objects so rows can be passed straight to client components.
    return result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]]))) as T[];
  };
  return { all, get: async <T,>(sql: string, ...args: SqlValue[]) => (await all<T>(sql, ...args))[0] };
}

async function openFile(): Promise<Database | null> {
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DDF_DB_PATH || ".data/ddf.sqlite");
  if (!existsSync(file)) return null;
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec("PRAGMA busy_timeout = 5000");
  const all = async <T,>(sql: string, ...args: SqlValue[]) => db.prepare(sql).all(...args).map(row => ({ ...row })) as T[];
  return { all, get: async <T,>(sql: string, ...args: SqlValue[]) => (await all<T>(sql, ...args))[0] };
}

/** The listing database, or null when none is configured (the site then shows sample homes). */
export function database(): Promise<Database | null> {
  opened ??= (async () => {
    try {
      const url = process.env.TURSO_DATABASE_URL?.trim();
      return url ? await openTurso(url) : await openFile();
    } catch (error) {
      console.error("Unable to open the DDF listing database.", error);
      opened = null; // retry on the next request
      return null;
    }
  })();
  return opened;
}
