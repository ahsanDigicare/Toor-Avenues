// Copies the local listing database (.data/ddf.sqlite) into Turso, so the live site has
// data immediately. After this, `npm run ddf:sync` (and the GitHub Action) keep Turso up
// to date directly. For a national first load it is usually faster to let the GitHub
// Action run the first sync straight into Turso instead (see README).
//
// Usage: npm run db:upload            (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in .env.local)
// Safe to re-run and resumable: rows are replaced, and rows no longer in the local file are removed.

import { openDatabase, sql } from "./db.mjs";

if (!process.env.TURSO_DATABASE_URL) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local first.");

// [table, primary key column, rows per INSERT]; listings carry a few KB of JSON each.
const TABLES = [
  ["listings", "listing_key", 25],
  ["offices", "office_key", 200],
  ["open_houses", "open_house_key", 200],
  ["sync_state", "key", 200],
];
const STATEMENTS_PER_REQUEST = 4;
const PAGE = 2_000;

/** Retries a request that failed on the network (dropped connection, timeout, 5xx). */
async function withRetry(work) {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); } catch (error) {
      const text = `${error?.message ?? ""} ${String(error?.cause ?? "")}`;
      if (attempt >= 6 || !/fetch failed|ECONNRESET|ETIMEDOUT|terminated|socket|network|timeout|50[0-4]/i.test(text)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

async function main() {
  const local = await openDatabase({ local: true });
  const remote = await openDatabase();
  console.log(`Copying ${local.label} → ${remote.label}`);

  for (const [table, key, rowsPerInsert] of TABLES) {
    const columns = (await local.all(`PRAGMA table_info(${table})`)).map((column) => column.name);
    const placeholders = `(${columns.map(() => "?").join(", ")})`;
    const total = (await local.get(`SELECT COUNT(*) AS count FROM ${table}`)).count;
    let copied = 0;
    let after = "";
    for (;;) {
      // Page through the table by key, so the whole national table is never in memory at once.
      const rows = await local.all(`SELECT ${columns.join(", ")} FROM ${table} WHERE ${key} > ? ORDER BY ${key} LIMIT ${PAGE}`, after);
      if (!rows.length) break;
      after = rows.at(-1)[key];
      const statements = [];
      for (let i = 0; i < rows.length; i += rowsPerInsert) {
        const chunk = rows.slice(i, i + rowsPerInsert);
        statements.push(sql(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")}`,
          ...chunk.flatMap((row) => columns.map((column) => row[column] ?? null))));
      }
      for (let i = 0; i < statements.length; i += STATEMENTS_PER_REQUEST) {
        await withRetry(() => remote.batch(statements.slice(i, i + STATEMENTS_PER_REQUEST)));
      }
      copied += rows.length;
      process.stdout.write(`\r  ${table}: ${copied.toLocaleString()} / ${total.toLocaleString()}`);
    }

    // Remove rows that exist only in Turso (e.g. from an older upload).
    const localKeys = new Set((await local.all(`SELECT ${key} FROM ${table}`)).map((row) => row[key]));
    const stale = (await withRetry(() => remote.all(`SELECT ${key} FROM ${table}`))).map((row) => row[key]).filter((value) => !localKeys.has(value));
    for (let i = 0; i < stale.length; i += 200) {
      await withRetry(() => remote.batch(stale.slice(i, i + 200).map((value) => sql(`DELETE FROM ${table} WHERE ${key} = ?`, value))));
    }
    console.log(`\r  ${table}: ${copied.toLocaleString()} rows copied${stale.length ? `, ${stale.length.toLocaleString()} stale removed` : ""}.        `);
  }

  const { count } = await remote.get("SELECT COUNT(*) AS count FROM listings");
  console.log(`Done. Turso now holds ${count.toLocaleString()} listings.`);
  local.close();
  remote.close();
}

main().catch((error) => {
  console.error(`Upload failed: ${error.message}`);
  process.exitCode = 1;
});
