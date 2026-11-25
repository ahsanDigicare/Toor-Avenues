// Synchronizes the REALTOR.ca DDF® feed (homes for sale across Canada, or a list of
// cities) into the SQLite database the website reads: Turso when TURSO_DATABASE_URL
// is set (the live site on Vercel), otherwise the local file .data/ddf.sqlite.
//
// Two kinds of run:
//   • Full check (first run, then at least once a day, as CREA requires): builds the
//     complete master list (ListingKey + timestamps), province by province in
//     parallel with key-based paging (not subject to the 10,000-record $skip limit),
//     fetches every new or changed listing, and deletes listings that left the feed
//     (sold, expired, withdrawn, or no longer approved for display).
//   • Changes only (the runs in between): asks DDF for listings modified since the
//     previous run and updates just those. Takes a minute or two instead of ~15.
// Every run also refreshes brokerages (Office), upcoming open houses, and the market
// summary the site shows (totals, typical prices, cities), stored in sync_state.
//
// Usage:
//   npm run ddf:sync                           incremental (full check when one is due)
//   npm run ddf:sync -- --full                 full check and re-fetch every listing
//   npm run ddf:sync -- --master               force a full check (removals) without re-fetching everything
//   npm run ddf:sync -- --allow-large-removal  bypass the mass-deletion guard
//   npm run ddf:sync -- --local                update the local file instead of Turso
//
// Environment (in .env.local, or GitHub Actions secrets): DDF_CLIENT_ID, DDF_CLIENT_SECRET,
// optionally TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, DDF_DB_PATH, and DDF_CITIES
// (comma-separated) + DDF_PROVINCE to limit the site to some cities instead of all of Canada.

import { openDatabase, sql } from "./db.mjs";
import { computeMarket } from "./market.mjs";

const apiBase = new URL("https://ddfapi.realtor.ca/odata/v1/");
const clientId = process.env.DDF_CLIENT_ID;
const clientSecret = process.env.DDF_CLIENT_SECRET;
const cities = (process.env.DDF_CITIES || "").split(",").map((city) => city.trim()).filter(Boolean);
const cityProvince = process.env.DDF_PROVINCE || "Alberta";
const args = new Set(process.argv.slice(2));
const fullRefresh = args.has("--full");
const forceMaster = fullRefresh || args.has("--master");
const allowLargeRemoval = args.has("--allow-large-removal");
const localOnly = args.has("--local"); // update .data/ddf.sqlite even when Turso is configured
const DETAIL_BATCH = 50;
const DETAIL_CONCURRENCY = 6;
const OFFICE_REFRESH_DAYS = 7;
const OPEN_HOUSE_REFRESH_HOURS = 3;
const MASTER_EVERY_HOURS = 20; // full master-list check at least daily
const MAX_LISTINGS = 400_000;

// Residential homes for sale (what the site shows). Leases, land-only and commercial
// records are left out entirely, which keeps the national database small.
const SUB_TYPES = ["Single Family", "Multi-family"];
// Provinces and territories as named in the feed. Each is fetched separately (in parallel).
const PROVINCES = ["Ontario", "British Columbia", "Alberta", "Saskatchewan", "Nova Scotia", "New Brunswick",
  "Newfoundland & Labrador", "Prince Edward Island", "Manitoba", "Quebec", "Yukon", "Northwest Territories", "Nunavut"];

if (!clientId || !clientSecret) throw new Error("DDF_CLIENT_ID and DDF_CLIENT_SECRET are required in .env.local.");
// On GitHub Actions a local file would be thrown away after the run.
if (process.env.CI && !process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN secrets are required when running in CI.");

// ---------------------------------------------------------------------------
// DDF client
// ---------------------------------------------------------------------------

let token;
let tokenExpiresAt = 0;
let tokenRequest = null;

async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExpiresAt) return token;
  // Parallel workers share one token request.
  tokenRequest ??= (async () => {
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
  })().finally(() => { tokenRequest = null; });
  return tokenRequest;
}

async function getJson(url) {
  if (url.origin !== apiBase.origin || !url.pathname.startsWith(apiBase.pathname)) throw new Error("Refusing to call a non-DDF URL.");
  const request = async (accessToken) => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(90_000) });
  for (let attempt = 0; attempt < 6; attempt++) {
    let response;
    let result;
    try {
      response = await request(await getToken());
      if (response.status === 401) response = await request(await getToken(true));
      // Reading the body is inside the retry too: a connection can drop mid-download ("terminated").
      if (response.ok) result = await response.json();
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      if (!Array.isArray(result?.value)) throw new Error("DDF returned an unexpected response.");
      return result;
    }
    if ((response.status !== 429 && response.status < 500) || attempt === 5) {
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

// The area, as independent OData filters that are fetched in parallel.
const typeFilter = `PropertySubType in (${SUB_TYPES.map(quote).join(",")})`;
const partitions = cities.length
  ? [{ name: cities.join(", "), filter: `${typeFilter} and StateOrProvince eq ${quote(cityProvince)} and City in (${cities.map(quote).join(",")})` }]
  : PROVINCES.map((name) => ({ name, filter: `${typeFilter} and StateOrProvince eq ${quote(name)}` }));
const areaLabel = cities.length ? `${cities.join(", ")} (${cityProvince})` : "all of Canada";

/** Every listing key (with timestamps) matching `filter`, paged by key. */
async function listKeys(filter, { checkComplete }) {
  const found = new Map();
  let after = null;
  let expected = null;
  for (;;) {
    const page = await getJson(resourceUrl("Property", {
      "$select": "ListingKey,ModificationTimestamp,PhotosChangeTimestamp",
      "$filter": after === null ? filter : `${filter} and ListingKey gt ${quote(after)}`,
      "$orderby": "ListingKey",
      "$top": "100",
      ...(after === null ? { "$count": "true" } : {}),
    }));
    if (after === null) expected = Number(page["@odata.count"]);
    for (const record of page.value) {
      if (record.ListingKey) found.set(String(record.ListingKey), { modifiedAt: record.ModificationTimestamp ?? null, photosChangedAt: record.PhotosChangeTimestamp ?? null });
    }
    if (page.value.length < 100) break;
    const last = String(page.value.at(-1).ListingKey);
    if (last === after) throw new Error("DDF key paging did not advance.");
    after = last;
    if (found.size > MAX_LISTINGS) throw new Error("Listing list is unexpectedly large; check the area filter.");
  }
  // Listings can change during the scan, so allow a small tolerance; a larger
  // shortfall means the list is incomplete and must not drive deletions.
  if (checkComplete && Number.isFinite(expected) && found.size < expected * 0.98) {
    throw new Error(`Master list incomplete (${found.size} of ${expected} listings). Nothing was deleted.`);
  }
  return found;
}

/** Keys from every partition at once (each partition pages sequentially). */
async function listAllKeys(extraFilter, options) {
  const parts = await Promise.all(partitions.map(async (part) => {
    const keys = await listKeys(extraFilter ? `${part.filter} and ${extraFilter}` : part.filter, options);
    if (keys.size) console.log(`  ${part.name}: ${keys.size.toLocaleString()}`);
    return keys;
  }));
  return new Map(parts.flatMap((part) => [...part]));
}

async function fetchDetails(keys, onBatch) {
  const batches = [];
  for (let i = 0; i < keys.length; i += DETAIL_BATCH) batches.push(keys.slice(i, i + DETAIL_BATCH));
  let next = 0;
  let done = 0;
  let reported = 0;
  let failed = false;
  async function worker() {
    while (next < batches.length && !failed) {
      const batch = batches[next++];
      try {
        await fetchBatch(batch);
      } catch (error) {
        failed = true; // stop the other workers too
        throw error;
      }
    }
  }
  async function fetchBatch(batch) {
    const page = await getJson(resourceUrl("Property", {
      "$filter": `ListingKey in (${batch.map(quote).join(",")})`,
      "$top": "100",
    }));
    await onBatch(page.value);
    done += batch.length;
    if (done - reported >= 5000 || done === keys.length) { reported = done; console.log(`Fetched details for ${done.toLocaleString()} of ${keys.length.toLocaleString()} listings.`); }
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

// Upcoming open houses across the feed (about 12,000 nationwide), paged by key
// to stay clear of the 10,000-record $skip limit.
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
    if (openHouses.length > 200_000) throw new Error("Open-house list is unexpectedly large.");
  }
  return openHouses;
}

// ---------------------------------------------------------------------------
// Listing records
// ---------------------------------------------------------------------------

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

// Fields of the DDF record that the listing page and the filters read (src/lib/listings.ts).
// Only these are kept in `raw`: the full record is ~8 KB, this is ~2 KB.
const RAW_FIELDS = [
  "AccessibilityFeatures", "Appliances", "ArchitecturalStyle", "AssociationFee", "AssociationFeeFrequency", "AssociationFeeIncludes",
  "Basement", "BedroomsAboveGrade", "BedroomsBelowGrade", "CommonInterest", "CommunityFeatures", "ConstructionMaterials", "Cooling",
  "ExteriorFeatures", "Fencing", "FireplaceFeatures", "FireplacesTotal", "Flooring", "FoundationDetails", "FrontageLengthNumeric",
  "FrontageLengthNumericUnits", "Heating", "Inclusions", "LotFeatures", "LotSizeArea", "LotSizeDimensions", "LotSizeUnits",
  "OriginatingSystemName", "ParkingFeatures", "ParkingTotal", "PoolFeatures", "Roof", "Stories", "TaxAnnualAmount", "TaxYear",
  "View", "WaterfrontFeatures", "YearBuilt", "Zoning", "ZoningDescription",
];
const empty = (value) => value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);

function trimmedRaw(property) {
  const raw = {};
  for (const field of RAW_FIELDS) if (!empty(property[field])) raw[field] = property[field];
  if (Array.isArray(property.Rooms) && property.Rooms.length) {
    raw.Rooms = property.Rooms.map((room) => ({ RoomType: room.RoomType, RoomLevel: room.RoomLevel, RoomDimensions: room.RoomDimensions }))
      .filter((room) => room.RoomType);
  }
  return JSON.stringify(raw);
}

function propertyPhotos(property) {
  return (Array.isArray(property.Media) ? property.Media : [])
    .filter((media) => ["property photo", "photo"].includes(String(media.MediaCategory || "").toLowerCase()))
    .filter((media) => typeof media.MediaURL === "string" && media.MediaURL.startsWith("https://"))
    .sort((a, b) => (a.Order ?? Number.MAX_SAFE_INTEGER) - (b.Order ?? Number.MAX_SAFE_INTEGER));
}

function listingRow(property, syncedAt) {
  const media = propertyPhotos(property);
  const cover = media.find((item) => item.PreferredPhotoYN === true) ?? media[0];
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
    nullable(property.City?.trim()),
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
    media.length,
    media.length ? JSON.stringify(media.map((item) => item.MediaURL)) : null,
    cover?.MediaURL ?? null,
    trimmedRaw(property),
    syncedAt,
  ];
}

const COLUMNS = ["listing_key", "listing_id", "modified_at", "photos_changed_at", "listed_at", "status", "price", "lease_amount", "lease_frequency",
  "address", "unit_number", "city", "province", "postal_code", "community", "latitude", "longitude", "bedrooms", "bathrooms", "bathrooms_partial",
  "floor_area_sqft", "property_sub_type", "structure_type", "year_built", "remarks", "listing_url", "list_office_key", "list_agent_key",
  "display_address", "display_listing", "originating_system", "photos_count", "photos", "photo", "raw", "synced_at"];
const UPSERT = `INSERT INTO listings (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(",")})
  ON CONFLICT (listing_key) DO UPDATE SET ${COLUMNS.slice(1).map((column) => `${column} = excluded.${column}`).join(", ")}`;

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  const db = await openDatabase({ local: localOnly });
  console.log(`Database: ${db.label}`);
  const state = async (key) => (await db.get("SELECT value FROM sync_state WHERE key = ?", key))?.value ?? null;
  const setState = (key, value) => sql("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);

  const stored = new Map((await db.all("SELECT listing_key, modified_at, photos_changed_at FROM listings"))
    .map((row) => [row.listing_key, row]));
  // A different area than last time (e.g. switching from Calgary to all of Canada) needs a full check.
  const areaChanged = (await state("area")) !== JSON.stringify({ area: areaLabel });
  const lastMaster = Date.parse((await state("master_synced_at")) ?? "") || 0;
  const lastRun = Date.parse((await state("last_success_started_at")) ?? "") || 0;
  const fullCheck = forceMaster || areaChanged || !stored.size || !lastRun || Date.now() - lastMaster > MASTER_EVERY_HOURS * 3_600_000;

  let master;
  let removed = [];
  if (fullCheck) {
    console.log(`Full check: building the master list for ${areaLabel}.`);
    master = await listAllKeys(null, { checkComplete: true });
    console.log(`Master list contains ${master.size.toLocaleString()} listings.`);
    removed = [...stored.keys()].filter((key) => !master.has(key));
    // Guard against an API glitch wiping the site. Real daily churn is far below this.
    if (!areaChanged && stored.size >= 200 && removed.length > stored.size * 0.3 && !allowLargeRemoval) {
      throw new Error(`Refusing to remove ${removed.length} of ${stored.size} listings. Re-run with --allow-large-removal if this is expected.`);
    }
  } else {
    // Overlap the previous run by an hour so nothing slips between runs.
    const since = new Date(lastRun - 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
    console.log(`Changes only: listings modified since ${since} in ${areaLabel}.`);
    master = await listAllKeys(`ModificationTimestamp gt ${since}`, { checkComplete: false });
  }
  const changed = [...master].filter(([key, remote]) => {
    const local = stored.get(key);
    return fullRefresh || !local || local.modified_at !== remote.modifiedAt || local.photos_changed_at !== remote.photosChangedAt;
  }).map(([key]) => key);
  console.log(`${changed.length.toLocaleString()} new or changed, ${removed.length.toLocaleString()} to remove.`);

  // Each detail batch (up to 50 listings, photos included) is written in one transaction.
  let upserted = 0;
  await fetchDetails(changed, async (properties) => {
    const syncedAt = new Date().toISOString();
    const statements = [];
    for (const property of properties) {
      // Only store listings from this run's list (the area's residential homes).
      if (!property.ListingKey || !master.has(String(property.ListingKey))) continue;
      statements.push(sql(UPSERT, ...listingRow(property, syncedAt)));
      upserted++;
    }
    await db.batch(statements);
  });

  // Child rows are deleted explicitly rather than relying on ON DELETE CASCADE,
  // which needs foreign keys switched on (not guaranteed on Turso).
  for (let i = 0; i < removed.length; i += 200) {
    await db.batch(removed.slice(i, i + 200).flatMap((key) => [
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
    for (let i = 0; i < offices.length; i += 500) {
      await db.batch(offices.slice(i, i + 500).map((office) => sql(`
        INSERT INTO offices (office_key, name, phone, city, modified_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (office_key) DO UPDATE SET name = excluded.name, phone = excluded.phone, city = excluded.city,
          modified_at = excluded.modified_at, synced_at = excluded.synced_at`,
        String(office.OfficeKey), nullable(office.OfficeName?.trim()), nullable(office.OfficePhone), nullable(office.OfficeCity), nullable(office.ModificationTimestamp), syncedAt)));
    }
  }

  // Open houses: refreshed every few hours. Only differences are written (new ones added,
  // past or cancelled ones removed), which keeps row writes low.
  const lastOpenHouseSync = Date.parse((await state("open_houses_synced_at")) ?? "") || 0;
  if (fullRefresh || Date.now() - lastOpenHouseSync > OPEN_HOUSE_REFRESH_HOURS * 3_600_000) {
    const fromDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const feed = (await fetchUpcomingOpenHouses(fromDate))
      .filter((item) => item.OpenHouseKey && item.ListingKey && item.OpenHouseDate && (!item.OpenHouseStatus || item.OpenHouseStatus === "Active"));
    const known = new Set((await db.all("SELECT listing_key FROM listings")).map((row) => row.listing_key));
    const wanted = new Map(feed.filter((item) => known.has(String(item.ListingKey))).map((item) => [String(item.OpenHouseKey), item]));
    const existing = new Set((await db.all("SELECT open_house_key FROM open_houses")).map((row) => row.open_house_key));
    const statements = [
      ...[...existing].filter((key) => !wanted.has(key)).map((key) => sql("DELETE FROM open_houses WHERE open_house_key = ?", key)),
      ...[...wanted].filter(([key]) => !existing.has(key)).map(([key, item]) => sql(`
        INSERT OR REPLACE INTO open_houses (open_house_key, listing_key, date, start_time, end_time, type, remarks, livestream_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, key, String(item.ListingKey), String(item.OpenHouseDate).slice(0, 10),
        nullable(item.OpenHouseStartTime), nullable(item.OpenHouseEndTime), nullable(item.OpenHouseType),
        nullable(item.OpenHouseRemarks?.trim()), nullable(item.LivestreamOpenHouseURL))),
    ];
    for (let i = 0; i < statements.length; i += 500) await db.batch(statements.slice(i, i + 500));
    await db.batch([setState("open_houses_synced_at", new Date().toISOString())]);
    console.log(`Open houses: ${wanted.size.toLocaleString()} upcoming (${statements.length.toLocaleString()} changes).`);
  }

  const [officesRemoved] = await db.batch([sql("DELETE FROM offices WHERE office_key NOT IN (SELECT list_office_key FROM listings WHERE list_office_key IS NOT NULL)")]);

  // Market summary for the website (one small JSON row instead of scanning every listing per page view).
  const market = await computeMarket(db);
  const total = (await db.get("SELECT COUNT(*) AS count FROM listings")).count;
  await db.batch([
    setState("last_success_started_at", startedAt),
    setState("last_success_finished_at", new Date().toISOString()),
    ...(fullCheck ? [setState("master_synced_at", startedAt)] : []),
    setState("area", JSON.stringify({ area: areaLabel })),
    setState("listing_count", String(total)),
    setState("market", JSON.stringify(market)),
  ]);
  db.close();

  console.log(`Sync complete (${fullCheck ? "full check" : "changes only"}): ${upserted.toLocaleString()} listings updated, ${removed.length.toLocaleString()} removed, ${officeKeys.length} offices refreshed, ${officesRemoved} unused offices removed. ${total.toLocaleString()} listings stored in ${db.label}.`);
}

main().catch((error) => {
  console.error(`DDF sync failed: ${error.message}`);
  process.exitCode = 1;
});
