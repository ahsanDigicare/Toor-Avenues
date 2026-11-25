// Synchronizes the Calgary-area subset of the REALTOR.ca DDF® feed into a local
// SQLite database that the website reads: Turso when TURSO_DATABASE_URL is set
// (the live site on Vercel), otherwise the local file .data/ddf.sqlite.
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
// Environment (in .env.local, or GitHub Actions secrets): DDF_CLIENT_ID, DDF_CLIENT_SECRET,
// optionally TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, DDF_CITIES (comma-separated), DDF_PROVINCE, DDF_DB_PATH.

import { openDatabase, sql } from "./db.mjs";

const apiBase = new URL("https://ddfapi.realtor.ca/odata/v1/");
const clientId = process.env.DDF_CLIENT_ID;
const clientSecret = process.env.DDF_CLIENT_SECRET;
const cities = (process.env.DDF_CITIES || "Calgary,Airdrie,Cochrane,Chestermere,Okotoks").split(",").map((city) => city.trim()).filter(Boolean);
const province = process.env.DDF_PROVINCE || "Alberta";
const args = new Set(process.argv.slice(2));
const fullRefresh = args.has("--full");
const allowLargeRemoval = args.has("--allow-large-removal");
const DETAIL_BATCH = 50;
const DETAIL_CONCURRENCY = 4;
const OFFICE_REFRESH_DAYS = 7;
const OPEN_HOUSE_REFRESH_HOURS = 3;

if (!clientId || !clientSecret) throw new Error("DDF_CLIENT_ID and DDF_CLIENT_SECRET are required in .env.local.");
if (!cities.length) throw new Error("DDF_CITIES must list at least one city.");
// On GitHub Actions a local file would be thrown away after the run.
if (process.env.CI && !process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN secrets are required when running in CI.");

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
      await onBatch(page.value);
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
  const db = await openDatabase();
  console.log(`Database: ${db.label}`);

  console.log(`Building master list for ${cities.join(", ")} (${province}).`);
  const master = await fetchMasterList();
  console.log(`Master list contains ${master.size} listings.`);

  const stored = new Map((await db.all("SELECT listing_key, modified_at, photos_changed_at FROM listings"))
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

  const UPSERT = `
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
      photos_count = excluded.photos_count, raw = excluded.raw, synced_at = excluded.synced_at`;

  let upserted = 0;
  let photoCount = 0;
  // Each detail batch (up to 50 listings and their photos) is written in one transaction.
  await fetchDetails(changed, async (properties) => {
    const syncedAt = new Date().toISOString();
    const statements = [];
    for (const property of properties) {
      // Only store what is still in this run's master list for the area.
      if (!property.ListingKey || !master.has(String(property.ListingKey))) continue;
      const key = String(property.ListingKey);
      statements.push(sql(UPSERT, ...listingRow(property, syncedAt)));
      // Most changes are price or text edits; rewrite photos only when they changed (saves
      // ~35 row writes per listing, which matters on Turso's monthly write allowance).
      const before = stored.get(key);
      const photosChanged = fullRefresh || !before || before.photos_changed_at !== nullable(property.PhotosChangeTimestamp);
      if (photosChanged) {
        statements.push(sql("DELETE FROM photos WHERE listing_key = ?", key));
        propertyPhotos(property).forEach((media, position) => {
          statements.push(sql("INSERT INTO photos (listing_key, position, url, preferred) VALUES (?, ?, ?, ?)", key, position, media.MediaURL, media.PreferredPhotoYN === true ? 1 : 0));
          photoCount++;
        });
      }
      upserted++;
    }
    await db.batch(statements);
  });

  // Child rows are deleted explicitly rather than relying on ON DELETE CASCADE,
  // which needs foreign keys switched on (not guaranteed on Turso).
  for (let i = 0; i < removed.length; i += 100) {
    await db.batch(removed.slice(i, i + 100).flatMap((key) => [
      sql("DELETE FROM photos WHERE listing_key = ?", key),
      sql("DELETE FROM open_houses WHERE listing_key = ?", key),
      sql("DELETE FROM listings WHERE listing_key = ?", key),
    ]));
  }

  // Brokerage (office) records for attribution.
  const refreshBefore = new Date(Date.now() - OFFICE_REFRESH_DAYS * 86_400_000).toISOString();
  const officeKeys = (await db.all(`
    SELECT DISTINCT l.list_office_key AS key FROM listings l
    LEFT JOIN offices o ON o.office_key = l.list_office_key
    WHERE l.list_office_key IS NOT NULL AND (o.office_key IS NULL OR o.synced_at < ?)`, refreshBefore)).map((row) => row.key);
  if (officeKeys.length) {
    const offices = await fetchOffices(officeKeys);
    const syncedAt = new Date().toISOString();
    await db.batch(offices.map((office) => sql(`
      INSERT INTO offices (office_key, name, phone, city, modified_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (office_key) DO UPDATE SET name = excluded.name, phone = excluded.phone, city = excluded.city,
        modified_at = excluded.modified_at, synced_at = excluded.synced_at`,
      String(office.OfficeKey), nullable(office.OfficeName?.trim()), nullable(office.OfficePhone), nullable(office.OfficeCity), nullable(office.ModificationTimestamp), syncedAt)));
  }

  // Open houses: refreshed every few hours (about 100 requests), replacing the stored set.
  const lastOpenHouseSync = Date.parse((await db.get("SELECT value FROM sync_state WHERE key = ?", "open_houses_synced_at"))?.value ?? "") || 0;
  if (fullRefresh || Date.now() - lastOpenHouseSync > OPEN_HOUSE_REFRESH_HOURS * 3_600_000) {
    const fromDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const openHouses = await fetchUpcomingOpenHouses(fromDate);
    const statements = [sql("DELETE FROM open_houses")];
    for (const openHouse of openHouses) {
      if (!openHouse.OpenHouseKey || !openHouse.ListingKey || !openHouse.OpenHouseDate) continue;
      if (openHouse.OpenHouseStatus && openHouse.OpenHouseStatus !== "Active") continue;
      const key = String(openHouse.ListingKey);
      statements.push(sql(`
        INSERT OR REPLACE INTO open_houses (open_house_key, listing_key, date, start_time, end_time, type, remarks, livestream_url)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM listings WHERE listing_key = ?)`,
        String(openHouse.OpenHouseKey), key, String(openHouse.OpenHouseDate).slice(0, 10),
        nullable(openHouse.OpenHouseStartTime), nullable(openHouse.OpenHouseEndTime), nullable(openHouse.OpenHouseType),
        nullable(openHouse.OpenHouseRemarks?.trim()), nullable(openHouse.LivestreamOpenHouseURL), key));
    }
    statements.push(sql("INSERT INTO sync_state (key, value) VALUES ('open_houses_synced_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", new Date().toISOString()));
    const changes = await db.batch(statements);
    const kept = changes.slice(1, -1).reduce((sum, n) => sum + n, 0);
    console.log(`Open houses: ${kept} upcoming in the area (of ${openHouses.length} nationwide).`);
  }

  const [officesRemoved] = await db.batch([sql("DELETE FROM offices WHERE office_key NOT IN (SELECT list_office_key FROM listings WHERE list_office_key IS NOT NULL)")]);

  const total = (await db.get("SELECT COUNT(*) AS count FROM listings")).count;
  const setState = (key, value) => sql("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
  await db.batch([
    setState("last_success_started_at", startedAt),
    setState("last_success_finished_at", new Date().toISOString()),
    setState("area", JSON.stringify({ cities, province })),
    setState("listing_count", String(total)),
  ]);
  db.close();

  console.log(`Sync complete: ${upserted} listings updated (${photoCount} photos), ${removed.length} removed, ${officeKeys.length} offices refreshed, ${officesRemoved} unused offices removed. ${total} listings stored in ${db.label}.`);
}

main().catch((error) => {
  console.error(`DDF sync failed: ${error.message}`);
  process.exitCode = 1;
});
