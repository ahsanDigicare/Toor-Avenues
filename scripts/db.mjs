// Database access for the DDF scripts, over either backend:
//   • Turso (hosted SQLite, used by the live site on Vercel) when TURSO_DATABASE_URL is set.
//   • The local SQLite file (.data/ddf.sqlite by default, or DDF_DB_PATH) otherwise.
// Both speak the same SQL. Every write goes through batch(), which is atomic on both.

import { mkdir } from "node:fs/promises";
import path from "node:path";

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS listings (
    listing_key TEXT PRIMARY KEY,
    listing_id TEXT,
    modified_at TEXT,
    photos_changed_at TEXT,
    listed_at TEXT,
    status TEXT,
    price REAL,
    lease_amount REAL,
    lease_frequency TEXT,
    address TEXT,
    unit_number TEXT,
    city TEXT,
    province TEXT,
    postal_code TEXT,
    community TEXT,
    latitude REAL,
    longitude REAL,
    bedrooms INTEGER,
    bathrooms INTEGER,
    bathrooms_partial INTEGER,
    floor_area_sqft REAL,
    property_sub_type TEXT,
    structure_type TEXT,
    year_built INTEGER,
    remarks TEXT,
    listing_url TEXT,
    list_office_key TEXT,
    list_agent_key TEXT,
    display_address INTEGER NOT NULL DEFAULT 1,
    display_listing INTEGER NOT NULL DEFAULT 1,
    originating_system TEXT,
    photos_count INTEGER,
    raw TEXT,
    synced_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS listings_city_price ON listings (city, price);
  CREATE INDEX IF NOT EXISTS listings_price ON listings (price);
  CREATE INDEX IF NOT EXISTS listings_listed_at ON listings (listed_at);
  CREATE INDEX IF NOT EXISTS listings_listing_id ON listings (listing_id COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS open_houses (
    open_house_key TEXT PRIMARY KEY,
    listing_key TEXT NOT NULL REFERENCES listings (listing_key) ON DELETE CASCADE,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    type TEXT,
    remarks TEXT,
    livestream_url TEXT
  );
  CREATE INDEX IF NOT EXISTS open_houses_listing ON open_houses (listing_key, date);
  CREATE TABLE IF NOT EXISTS photos (
    listing_key TEXT NOT NULL REFERENCES listings (listing_key) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url TEXT NOT NULL,
    preferred INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (listing_key, position)
  );
  CREATE TABLE IF NOT EXISTS offices (
    office_key TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    city TEXT,
    modified_at TEXT,
    synced_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
`;

/** A statement for batch(): [sql, ...args]. */
export const sql = (text, ...args) => ({ sql: text, args });

async function openTurso(url) {
  // A "file:" URL runs the same client against a local libSQL file (handy for testing).
  const local = url.startsWith("file:");
  const { createClient } = await import(local ? "@libsql/client" : "@libsql/client/web");
  const client = createClient({ url: local ? url : url.replace(/^libsql:\/\//, "https://"), authToken: process.env.TURSO_AUTH_TOKEN });
  const plain = (result) => result.rows.map((row) => Object.fromEntries(result.columns.map((column) => [column, row[column]])));
  return {
    label: local ? `libSQL (${url})` : `Turso (${new URL(url.replace(/^libsql:\/\//, "https://")).host})`,
    async all(text, ...args) { return plain(await client.execute({ sql: text, args })); },
    async get(text, ...args) { return plain(await client.execute({ sql: text, args }))[0]; },
    async exec(text) { await client.executeMultiple(text); },
    /** Runs the statements in one transaction; returns rows changed per statement. */
    async batch(statements) {
      if (!statements.length) return [];
      return (await client.batch(statements, "write")).map((result) => result.rowsAffected);
    },
    close() { client.close(); },
  };
}

async function openFile(file) {
  const { DatabaseSync } = await import("node:sqlite");
  await mkdir(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const cache = new Map();
  const prepare = (text) => { let statement = cache.get(text); if (!statement) cache.set(text, statement = db.prepare(text)); return statement; };
  return {
    label: path.relative(process.cwd(), file),
    async all(text, ...args) { return prepare(text).all(...args); },
    async get(text, ...args) { return prepare(text).get(...args); },
    async exec(text) { db.exec(text); },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const changes = statements.map(({ sql: text, args }) => Number(prepare(text).run(...args).changes));
        db.exec("COMMIT");
        return changes;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); },
  };
}

/** Opens Turso when configured, otherwise the local file; `{ local: true }` forces the file. */
export async function openDatabase({ local = false } = {}) {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const db = url && !local ? await openTurso(url) : await openFile(path.resolve(process.env.DDF_DB_PATH || ".data/ddf.sqlite"));
  await db.exec(SCHEMA);
  return db;
}
