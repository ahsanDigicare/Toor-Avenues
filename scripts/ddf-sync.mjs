// Synchronizes the Calgary-area subset of the REALTOR.ca DDF® feed into a local
// SQLite database (.data/ddf.sqlite by default) that the website reads.
//
// Each run:
//   1. Builds the area's master list (ListingKey + timestamps) with key-based
//      paging, which is not subject to the 10,000-record $skip limit.
//   2. Fetches full details (including Media) only for new or changed listings.
//   3. Deletes listings that are no longer in the master list (sold, expired,
//      withdrawn, or no longer approved for distribution).
//   4. Refreshes the listing brokerages (Office records) and removes unused ones.
//
// Usage:
//   npm run ddf:sync                         incremental sync
//   npm run ddf:sync -- --full               re-fetch details for every listing
//   npm run ddf:sync -- --allow-large-removal  bypass the mass-deletion guard
//
// Environment (in .env.local): DDF_CLIENT_ID, DDF_CLIENT_SECRET, and optionally
// DDF_CITIES (comma-separated), DDF_PROVINCE, DDF_DB_PATH.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const apiBase = new URL("https://ddfapi.realtor.ca/odata/v1/");
const clientId = process.env.DDF_CLIENT_ID;
const clientSecret = process.env.DDF_CLIENT_SECRET;
const cities = (process.env.DDF_CITIES || "Calgary,Airdrie,Cochrane,Chestermere,Okotoks").split(",").map((city) => city.trim()).filter(Boolean);
const province = process.env.DDF_PROVINCE || "Alberta";
const databasePath = path.resolve(process.env.DDF_DB_PATH || ".data/ddf.sqlite");
const args = new Set(process.argv.slice(2));
const fullRefresh = args.has("--full");
const allowLargeRemoval = args.has("--allow-large-removal");
const DETAIL_BATCH = 50;
const DETAIL_CONCURRENCY = 4;
const OFFICE_REFRESH_DAYS = 7;
const OPEN_HOUSE_REFRESH_HOURS = 3;

if (!clientId || !clientSecret) throw new Error("DDF_CLIENT_ID and DDF_CLIENT_SECRET are required in .env.local.");
if (!cities.length) throw new Error("DDF_CITIES must list at least one city.");

// ---------------------------------------------------------------------------
// DDF client
// ---------------------------------------------------------------------------

let token;
let tokenExpiresAt = 0;

async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExpiresAt) return token;
  const response = await fetch("https://identity.crea.ca/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: "DDFApi_Read" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`DDF authentication failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (!result.access_token) throw new Error("DDF did not return an access token.");
  token = result.access_token;
  // Tokens are not sliding; renew a minute before the stated expiry.
  tokenExpiresAt = Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000;
  return token;
}

async function getJson(url) {
  if (url.origin !== apiBase.origin || !url.pathname.startsWith(apiBase.pathname)) throw new Error("Refusing to call a non-DDF URL.");
  const request = async (accessToken) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(60_000) });
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await request(await getToken());
      if (response.status === 401) response = await request(await getToken(true));
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const result = await response.json();
      if (!Array.isArray(result.value)) throw new Error("DDF returned an unexpected response.");
      return result;
    }
    if ((response.status !== 429 && response.status < 500) || attempt === 4) {
      throw new Error(`DDF request failed (HTTP ${response.status}) for ${url.pathname}.`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * 2 ** attempt);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function resourceUrl(resource, params) {
  const url = new URL(resource, apiBase);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

const areaFilter = `StateOrProvince eq ${quote(province)} and City in (${cities.map(quote).join(",")})`;

async function fetchMasterList() {
  const master = new Map();
  let after = null;
  let expected = null;
  for (;;) {
    const filter = after === null ? areaFilter : `${areaFilter} and ListingKey gt ${quote(after)}`;
    const page = await getJson(resourceUrl("Property", {
      "$select": "ListingKey,ModificationTimestamp,PhotosChangeTimestamp",
      "$filter": filter,
      "$orderby": "ListingKey",
      "$top": "100",
      ...(after === null ? { "$count": "true" } : {}),
    }));
    if (after === null) expected = Number(page["@odata.count"]);
    for (const record of page.value) {
      if (record.ListingKey) master.set(String(record.ListingKey), { modifiedAt: record.ModificationTimestamp ?? null, photosChangedAt: record.PhotosChangeTimestamp ?? null });
    }
    if (page.value.length < 100) break;
    const last = String(page.value.at(-1).ListingKey);
    if (last === after) throw new Error("DDF key paging did not advance.");
    after = last;
    if (master.size > 200_000) throw new Error("Master list is unexpectedly large; check the area filter.");
  }
  // Listings can change during the scan, so allow a small tolerance; a larger
  // shortfall means the list is incomplete and must not drive deletions.
  if (Number.isFinite(expected) && master.size < expected * 0.98) {
    throw new Error(`Master list incomplete (${master.size} of ${expected} listings). Nothing was deleted.`);
  }
  return master;
}

async function fetchDetails(keys, onBatch) {
  const batches = [];
  for (let i = 0; i < keys.length; i += DETAIL_BATCH) batches.push(keys.slice(i, i + DETAIL_BATCH));
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const page = await getJson(resourceUrl("Property", {
        "$filter": `ListingKey in (${batch.map(quote).join(",")})`,
        "$top": "100",
      }));
      onBatch(page.value);
      done += batch.length;
      if (done % 1000 < DETAIL_BATCH || done === keys.length) console.log(`Fetched details for ${done} of ${keys.length} listings.`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, batches.length) }, worker));
}

async function fetchOffices(keys) {
  const offices = [];
  for (let i = 0; i < keys.length; i += DETAIL_BATCH) {
    const batch = keys.slice(i, i + DETAIL_BATCH);
    const page = await getJson(resourceUrl("Office", {
      "$select": "OfficeKey,OfficeName,OfficePhone,OfficeCity,ModificationTimestamp",
      "$filter": `OfficeKey in (${batch.map(quote).join(",")})`,
      "$top": "100",
    }));
    offices.push(...page.value);
  }
  return offices;
}

// Upcoming open houses across the feed (about 10,000 nationwide), paged by key
// to stay clear of the 10,000-record $skip limit. Only area listings are kept.
async function fetchUpcomingOpenHouses(fromDate) {
  const openHouses = [];
  let after = null;
  for (;;) {
    const dateFilter = `OpenHouseDate ge ${fromDate}`;
    const page = await getJson(resourceUrl("OpenHouse", {
      "$filter": after === null ? dateFilter : `${dateFilter} and OpenHouseKey gt ${quote(after)}`,
      "$orderby": "OpenHouseKey",
      "$top": "100",
    }));
    openHouses.push(...page.value);
    if (page.value.length < 100) break;
    const last = String(page.value.at(-1).OpenHouseKey);
    if (last === after) throw new Error("DDF open-house paging did not advance.");
    after = last;
    if (openHouses.length > 100_000) throw new Error("Open-house list is unexpectedly large.");
  }
  return openHouses;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function openDatabase() {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
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
  `);
  return db;
}

function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const SQFT_PER_SQM = 10.7639;
function floorArea(property) {
  const candidates = [
    [property.LivingArea, property.LivingAreaUnits],
    [property.AboveGradeFinishedArea, property.AboveGradeFinishedAreaUnits],
    [property.BuildingAreaTotal, property.BuildingAreaUnits],
  ];
  for (const [value, units] of candidates) {
    const area = Number(value);
    if (!value || !Number.isFinite(area) || area <= 0) continue;
    return /met/i.test(String(units || "")) ? Math.round(area * SQFT_PER_SQM) : Math.round(area);
  }
  return null;
}

const list = (value) => (Array.isArray(value) && value.length ? value.join(", ") : null);
const flag = (value) => (value === false ? 0 : 1);
const nullable = (value) => (value === undefined || value === "" ? null : value);

function listingRow(property, syncedAt) {
  // Photos live in their own table, so keep them out of the raw copy.
  const raw = { ...property };
  delete raw.Media;
  return [
    String(property.ListingKey),
    nullable(property.ListingId),
    nullable(property.ModificationTimestamp),
    nullable(property.PhotosChangeTimestamp),
    nullable(property.OriginalEntryTimestamp),
    nullable(property.StandardStatus),
    property.ListPrice ?? null,
    property.LeaseAmount ?? null,
    nullable(property.LeaseAmountFrequency),
    nullable(property.UnparsedAddress?.trim()),
    nullable(property.UnitNumber),
    nullable(property.City),
    nullable(property.StateOrProvince),
    nullable(property.PostalCode),
    nullable(property.SubdivisionName ?? property.CityRegion),
    property.Latitude ?? null,
    property.Longitude ?? null,
    property.BedroomsTotal ?? null,
    property.BathroomsTotalInteger ?? null,
    property.BathroomsPartial ?? null,
    floorArea(property),
    nullable(property.PropertySubType),
    list(property.StructureType),
    property.YearBuilt ?? null,
    nullable(property.PublicRemarks?.trim()),
    nullable(property.ListingURL),
    nullable(property.ListOfficeKey),
    nullable(property.ListAgentKey),
    flag(property.InternetAddressDisplayYN),
    flag(property.InternetEntireListingDisplayYN),
    nullable(property.OriginatingSystemName),
    property.PhotosCount ?? null,
    JSON.stringify(raw),
    syncedAt,
  ];
}

function propertyPhotos(property) {
  return (Array.isArray(property.Media) ? property.Media : [])
    .filter((media) => ["property photo", "photo"].includes(String(media.MediaCategory || "").toLowerCase()))
    .filter((media) => typeof media.MediaURL === "string" && media.MediaURL.startsWith("https://"))
    .sort((a, b) => (a.Order ?? Number.MAX_SAFE_INTEGER) - (b.Order ?? Number.MAX_SAFE_INTEGER));
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(path.dirname(databasePath), { recursive: true });
  const db = openDatabase();

  console.log(`Building master list for ${cities.join(", ")} (${province}).`);
  const master = await fetchMasterList();
  console.log(`Master list contains ${master.size} listings.`);

  const stored = new Map(db.prepare("SELECT listing_key, modified_at, photos_changed_at FROM listings").all()
    .map((row) => [row.listing_key, row]));
  const changed = [...master].filter(([key, remote]) => {
    const local = stored.get(key);
    return fullRefresh || !local || local.modified_at !== remote.modifiedAt || local.photos_changed_at !== remote.photosChangedAt;
  }).map(([key]) => key);
  const removed = [...stored.keys()].filter((key) => !master.has(key));
  console.log(`${changed.length} new or changed, ${removed.length} to remove.`);

  // Guard against an API glitch wiping the site. Real churn is far below this.
  if (stored.size >= 200 && removed.length > stored.size * 0.3 && !allowLargeRemoval) {
    throw new Error(`Refusing to remove ${removed.length} of ${stored.size} listings. Re-run with --allow-large-removal if this is expected.`);
  }

  const upsert = db.prepare(`
    INSERT INTO listings (listing_key, listing_id, modified_at, photos_changed_at, listed_at, status, price, lease_amount, lease_frequency,
      address, unit_number, city, province, postal_code, community, latitude, longitude, bedrooms, bathrooms, bathrooms_partial,
      floor_area_sqft, property_sub_type, structure_type, year_built, remarks, listing_url, list_office_key, list_agent_key,
      display_address, display_listing, originating_system, photos_count, raw, synced_at)
    VALUES (${Array(34).fill("?").join(",")})
    ON CONFLICT (listing_key) DO UPDATE SET
      listing_id = excluded.listing_id, modified_at = excluded.modified_at, photos_changed_at = excluded.photos_changed_at,
      listed_at = excluded.listed_at, status = excluded.status, price = excluded.price, lease_amount = excluded.lease_amount,
      lease_frequency = excluded.lease_frequency, address = excluded.address, unit_number = excluded.unit_number, city = excluded.city,
      province = excluded.province, postal_code = excluded.postal_code, community = excluded.community, latitude = excluded.latitude,
      longitude = excluded.longitude, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
      bathrooms_partial = excluded.bathrooms_partial, floor_area_sqft = excluded.floor_area_sqft,
      property_sub_type = excluded.property_sub_type, structure_type = excluded.structure_type, year_built = excluded.year_built,
      remarks = excluded.remarks, listing_url = excluded.listing_url, list_office_key = excluded.list_office_key,
      list_agent_key = excluded.list_agent_key, display_address = excluded.display_address,
      display_listing = excluded.display_listing, originating_system = excluded.originating_system,
      photos_count = excluded.photos_count, raw = excluded.raw, synced_at = excluded.synced_at`);
  const clearPhotos = db.prepare("DELETE FROM photos WHERE listing_key = ?");
  const insertPhoto = db.prepare("INSERT INTO photos (listing_key, position, url, preferred) VALUES (?, ?, ?, ?)");

  let upserted = 0;
  let photoCount = 0;
  await fetchDetails(changed, (properties) => transaction(db, () => {
    const syncedAt = new Date().toISOString();
    for (const property of properties) {
      // Only store what is still in this run's master list for the area.
      if (!property.ListingKey || !master.has(String(property.ListingKey))) continue;
      upsert.run(...listingRow(property, syncedAt));
      clearPhotos.run(String(property.ListingKey));
      propertyPhotos(property).forEach((media, position) => {
        insertPhoto.run(String(property.ListingKey), position, media.MediaURL, media.PreferredPhotoYN === true ? 1 : 0);
        photoCount++;
      });
      upserted++;
    }
  }));

  const remove = db.prepare("DELETE FROM listings WHERE listing_key = ?");
  transaction(db, () => { for (const key of removed) remove.run(key); });

  // Brokerage (office) records for attribution.
  const refreshBefore = new Date(Date.now() - OFFICE_REFRESH_DAYS * 86_400_000).toISOString();
  const officeKeys = db.prepare(`
    SELECT DISTINCT l.list_office_key AS key FROM listings l
    LEFT JOIN offices o ON o.office_key = l.list_office_key
    WHERE l.list_office_key IS NOT NULL AND (o.office_key IS NULL OR o.synced_at < ?)`).all(refreshBefore).map((row) => row.key);
  if (officeKeys.length) {
    const offices = await fetchOffices(officeKeys);
    const upsertOffice = db.prepare(`
      INSERT INTO offices (office_key, name, phone, city, modified_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (office_key) DO UPDATE SET name = excluded.name, phone = excluded.phone, city = excluded.city,
        modified_at = excluded.modified_at, synced_at = excluded.synced_at`);
    const syncedAt = new Date().toISOString();
    transaction(db, () => {
      for (const office of offices) {
        upsertOffice.run(String(office.OfficeKey), nullable(office.OfficeName?.trim()), nullable(office.OfficePhone), nullable(office.OfficeCity), nullable(office.ModificationTimestamp), syncedAt);
      }
    });
  }
  // Open houses: refreshed every few hours (about 100 requests), replacing the stored set.
  const getState = db.prepare("SELECT value FROM sync_state WHERE key = ?");
  const lastOpenHouseSync = Date.parse(getState.get("open_houses_synced_at")?.value ?? "") || 0;
  let openHouseCount = null;
  if (fullRefresh || Date.now() - lastOpenHouseSync > OPEN_HOUSE_REFRESH_HOURS * 3_600_000) {
    const fromDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const openHouses = await fetchUpcomingOpenHouses(fromDate);
    const insertOpenHouse = db.prepare(`
      INSERT OR REPLACE INTO open_houses (open_house_key, listing_key, date, start_time, end_time, type, remarks, livestream_url)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM listings WHERE listing_key = ?)`);
    openHouseCount = transaction(db, () => {
      db.exec("DELETE FROM open_houses");
      let kept = 0;
      for (const openHouse of openHouses) {
        if (!openHouse.OpenHouseKey || !openHouse.ListingKey || !openHouse.OpenHouseDate) continue;
        if (openHouse.OpenHouseStatus && openHouse.OpenHouseStatus !== "Active") continue;
        const key = String(openHouse.ListingKey);
        kept += Number(insertOpenHouse.run(String(openHouse.OpenHouseKey), key, String(openHouse.OpenHouseDate).slice(0, 10),
          nullable(openHouse.OpenHouseStartTime), nullable(openHouse.OpenHouseEndTime), nullable(openHouse.OpenHouseType),
          nullable(openHouse.OpenHouseRemarks?.trim()), nullable(openHouse.LivestreamOpenHouseURL), key).changes);
      }
      db.prepare("INSERT INTO sync_state (key, value) VALUES ('open_houses_synced_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
      return kept;
    });
    console.log(`Open houses: ${openHouseCount} upcoming in the area (of ${openHouses.length} nationwide).`);
  }

  const officesRemoved = db.prepare("DELETE FROM offices WHERE office_key NOT IN (SELECT list_office_key FROM listings WHERE list_office_key IS NOT NULL)").run().changes;

  const setState = db.prepare("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const total = db.prepare("SELECT COUNT(*) AS count FROM listings").get().count;
  transaction(db, () => {
    setState.run("last_success_started_at", startedAt);
    setState.run("last_success_finished_at", new Date().toISOString());
    setState.run("area", JSON.stringify({ cities, province }));
    setState.run("listing_count", String(total));
  });
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();

  console.log(`Sync complete: ${upserted} listings updated (${photoCount} photos), ${removed.length} removed, ${officeKeys.length} offices refreshed, ${officesRemoved} unused offices removed. ${total} listings stored in ${path.relative(process.cwd(), databasePath)}.`);
}

main().catch((error) => {
  console.error(`DDF sync failed: ${error.message}`);
  process.exitCode = 1;
});
