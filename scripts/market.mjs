// Market summary shown across the website (headline numbers, price chart, province
// and city pickers, "top markets" cards, Sell/Buy page stats). Computed once per sync
// and stored as one JSON row in sync_state ("market"), so page views never have to
// scan every listing in Canada.
//
// Run on its own (after changing this file): node --env-file-if-exists=.env.local scripts/market.mjs [--local]

import { pathToFileURL } from "node:url";
import { openDatabase, sql } from "./db.mjs";

// Same rules as BASE_WHERE in src/lib/listings.ts: residential homes for sale that may be displayed.
const SHOWN = "display_listing = 1 AND price IS NOT NULL AND price > 0 AND property_sub_type IN ('Single Family', 'Multi-family')";
const NEW_DAYS = 7;
const MIN_CITY_LISTINGS = 10;
const MAX_CITIES = 800;
const FEATURED_CITIES = 8;

export const PROVINCE_CODES = {
  "Alberta": "AB", "British Columbia": "BC", "Manitoba": "MB", "New Brunswick": "NB", "Newfoundland & Labrador": "NL",
  "Nova Scotia": "NS", "Northwest Territories": "NT", "Nunavut": "NU", "Ontario": "ON", "Prince Edward Island": "PE",
  "Quebec": "QC", "Saskatchewan": "SK", "Yukon": "YT",
};

const median = (sorted) => sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
// "TORONTO" / "toronto" → "Toronto" (most feeds are already proper case).
const tidy = (name) => name === name.toUpperCase() || name === name.toLowerCase()
  ? name.toLowerCase().replace(/(^|[\s\-'(/])\p{L}/gu, (letter) => letter.toUpperCase()) : name;

// Homes per type for the Buy page cards. Same conditions as TYPE_FILTERS in src/lib/listings.ts (keep in step).
const TYPE_COUNTS = {
  "Detached": "structure_type = 'House'",
  "Semi-detached": "structure_type = 'Duplex'",
  "Townhouse": "structure_type = 'Row / Townhouse'",
  "Condo": "structure_type = 'Apartment'",
  "Bungalow": "EXISTS (SELECT 1 FROM json_each(raw, '$.ArchitecturalStyle') s WHERE s.value = 'Bungalow')",
  "Multi-family": "property_sub_type = 'Multi-family'",
  "Mobile": "structure_type IN ('Mobile Home', 'Manufactured Home')",
  "Acreage": "(json_extract(raw, '$.LotSizeUnits') = 'acres' AND json_extract(raw, '$.LotSizeArea') >= 1 OR json_extract(raw, '$.LotSizeUnits') = 'square feet' AND json_extract(raw, '$.LotSizeArea') >= 43560)",
};

export async function computeMarket(db) {
  const typeRow = await db.get(`SELECT ${Object.entries(TYPE_COUNTS).map(([, clause], i) => `SUM(CASE WHEN ${clause} THEN 1 ELSE 0 END) AS t${i}`).join(", ")} FROM listings WHERE ${SHOWN}`);
  const typeCounts = Object.fromEntries(Object.keys(TYPE_COUNTS).map((type, i) => [type, Number(typeRow?.[`t${i}`] ?? 0)]));

  const rows = await db.all(`SELECT price, province, city, floor_area_sqft AS sqft, latitude AS lat, longitude AS lng,
      julianday('now') - julianday(listed_at) AS days FROM listings WHERE ${SHOWN}`);
  const prices = rows.map((row) => row.price).sort((a, b) => a - b);
  const days = rows.map((row) => row.days ?? 0).filter((value) => value >= 0).sort((a, b) => a - b);
  const isNew = (row) => row.days !== null && row.days >= 0 && row.days <= NEW_DAYS;

  // Every 0.5% of asking prices: enough to draw the price chart and share-of-homes figures.
  const priceQuantiles = prices.length ? Array.from({ length: 201 }, (_, i) => prices[Math.min(prices.length - 1, Math.round(i / 200 * (prices.length - 1)))]) : [];

  const groupBy = (keyOf) => {
    const groups = new Map();
    for (const row of rows) {
      const key = keyOf(row);
      if (!key) continue;
      const group = groups.get(key);
      if (group) group.push(row); else groups.set(key, [row]);
    }
    return groups;
  };
  const summary = (list) => {
    const sortedPrices = list.map((row) => row.price).sort((a, b) => a - b);
    const ppsf = list.filter((row) => row.sqft && row.sqft > 300).map((row) => row.price / row.sqft).sort((a, b) => a - b);
    return { count: list.length, fresh: list.filter(isNew).length, medianPrice: median(sortedPrices), medianPpsf: ppsf.length >= 5 ? Math.round(median(ppsf)) : null };
  };

  const provinces = [...groupBy((row) => row.province)].map(([name, list]) => ({ name, code: PROVINCE_CODES[name] ?? name, ...summary(list) }))
    .sort((a, b) => b.count - a.count);

  const cities = [...groupBy((row) => row.city && row.province ? `${row.city.trim().toLowerCase()}|${row.province}` : null)]
    .filter(([, list]) => list.length >= MIN_CITY_LISTINGS)
    .map(([, list]) => {
      // Most common spelling of the name; centre of the located listings for the map.
      const spellings = new Map();
      for (const row of list) spellings.set(row.city.trim(), (spellings.get(row.city.trim()) ?? 0) + 1);
      const name = tidy([...spellings].sort((a, b) => b[1] - a[1])[0][0]);
      const located = list.filter((row) => row.lat && row.lng);
      const lats = located.map((row) => row.lat).sort((a, b) => a - b);
      const lngs = located.map((row) => row.lng).sort((a, b) => a - b);
      return { city: name, raw: [...spellings.keys()], province: list[0].province, code: PROVINCE_CODES[list[0].province] ?? list[0].province,
        ...summary(list), lat: median(lats) || null, lng: median(lngs) || null };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CITIES);

  // A photo for the busiest cities: a recent, typically priced detached home with its address shown.
  const featured = [];
  for (const city of cities.slice(0, FEATURED_CITIES)) {
    const pick = await db.get(`SELECT photo, listing_id, address, city FROM listings
      WHERE ${SHOWN} AND province = ? AND city IN (${city.raw.map(() => "?").join(",")}) AND photo IS NOT NULL AND display_address = 1
      ORDER BY structure_type = 'House' DESC, ABS(price - ?) LIMIT 1`, city.province, ...city.raw, city.medianPrice);
    featured.push({ city: city.city, province: city.province, code: city.code, count: city.count, medianPrice: city.medianPrice, photo: pick?.photo ?? null });
  }

  return {
    updatedAt: new Date().toISOString(),
    total: rows.length,
    fresh: rows.filter(isNew).length,
    medianPrice: median(prices),
    medianDays: Math.round(median(days)),
    priceQuantiles,
    typeCounts,
    provinces,
    cities: cities.map(({ raw: _raw, ...city }) => city),
    featured,
  };
}

// Standalone: recompute and store the summary.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await openDatabase({ local: process.argv.includes("--local") });
  const market = await computeMarket(db);
  await db.batch([sql("INSERT INTO sync_state (key, value) VALUES ('market', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(market))]);
  db.close();
  console.log(`Market summary stored in ${db.label}: ${market.total.toLocaleString()} homes, ${market.provinces.length} provinces, ${market.cities.length} cities.`);
}
