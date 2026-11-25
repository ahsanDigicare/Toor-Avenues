// One-time copy of the local listing database (.data/ddf.sqlite) into Turso, so the
// live site has data immediately. After this, `npm run ddf:sync` (and the nightly
// GitHub Action) keep Turso up to date directly.
//
// Usage: npm run db:upload            (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in .env.local)
// Safe to re-run: rows are replaced, and rows no longer in the local file are removed.

import { openDatabase, sql } from "./db.mjs";

if (!process.env.TURSO_DATABASE_URL) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local first.");

// [table, primary key columns, rows per INSERT]; listings carry ~9 KB of raw JSON each.
const TABLES = [
  ["listings", ["listing_key"], 40],
  ["offices", ["office_key"], 200],
  ["photos", ["listing_key", "position"], 400],
  ["open_houses", ["open_house_key"], 200],
  ["sync_state", ["key"], 200],
];
const STATEMENTS_PER_REQUEST = 5;

async function main() {
  const local = await openDatabase({ local: true });
  const remote = await openDatabase();
  console.log(`Copying ${local.label} → ${remote.label}`);

  for (const [table, keys, rowsPerInsert] of TABLES) {
    const columns = (await local.all(`PRAGMA table_info(${table})`)).map((column) => column.name);
    const rows = await local.all(`SELECT ${columns.join(", ")} FROM ${table}`);
    const placeholders = `(${columns.map(() => "?").join(", ")})`;
    let pending = [];
    let copied = 0;
    const flush = async () => { await remote.batch(pending); pending = []; };
    for (let i = 0; i < rows.length; i += rowsPerInsert) {
      const chunk = rows.slice(i, i + rowsPerInsert);
      pending.push(sql(`INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")}`,
        ...chunk.flatMap((row) => columns.map((column) => row[column] ?? null))));
      copied += chunk.length;
      if (pending.length >= STATEMENTS_PER_REQUEST) {
        await flush();
        process.stdout.write(`\r  ${table}: ${copied.toLocaleString()} / ${rows.length.toLocaleString()}`);
      }
    }
    if (pending.length) await flush();

    // Remove rows that exist only in Turso (e.g. from an older upload).
    const remoteKeys = await remote.all(`SELECT ${keys.join(", ")} FROM ${table}`);
    const localKeys = new Set(rows.map((row) => keys.map((key) => row[key]).join("\u0000")));
    const stale = remoteKeys.filter((row) => !localKeys.has(keys.map((key) => row[key]).join("\u0000")));
    for (let i = 0; i < stale.length; i += 200) {
      await remote.batch(stale.slice(i, i + 200).map((row) => sql(`DELETE FROM ${table} WHERE ${keys.map((key) => `${key} = ?`).join(" AND ")}`, ...keys.map((key) => row[key]))));
    }
    console.log(`\r  ${table}: ${rows.length.toLocaleString()} rows copied${stale.length ? `, ${stale.length} stale removed` : ""}.        `);
  }

  const [{ count }] = await remote.all("SELECT COUNT(*) AS count FROM listings");
  console.log(`Done. Turso now holds ${count.toLocaleString()} listings.`);
  local.close();
  remote.close();
}

main().catch((error) => {
  console.error(`Upload failed: ${error.message}`);
  process.exitCode = 1;
});
