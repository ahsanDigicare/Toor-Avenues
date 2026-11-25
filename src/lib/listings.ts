import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Read-only access to the DDF® listing database written by scripts/ddf-sync.mjs.
// Credentials never reach this module; it only reads the synced local copy.

export type Listing = {
  id: string;
  /** SEO path segment, matching the previous site: {address}-{city}-{mls}. */
  slug: string;
  mls: string;
  price: number;
  priceLabel: string;
  address: string;
  area: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string;
  days: number;
  /** "2 hours ago", "3 days ago" */
  ageLabel: string;
  /** "Open house · Sat, Nov 28" or "New · 2 hours ago" (null when neither applies). */
  badge: string | null;
  photo: string | null;
  photoCount: number;
  brokerage: string | null;
  listingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  remarks: string | null;
};

export type ListingSort = "newest" | "low" | "high" | "sqft";

export type ListingFilters = {
  city?: string;
  query?: string;
  zone?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  type?: string;
  minSqft?: number;
  maxSqft?: number;
  minYear?: number;
  maxYear?: number;
  /** Minimum lot size in acres. */
  minLotAcres?: number;
  /** Listed within this many days. */
  maxDays?: number;
  minParking?: number;
  /** Maximum condo / association fee per month. */
  maxFee?: number;
  /** Words to find in the listing description. */
  keyword?: string;
  /** Feature keys from FEATURE_FILTERS. */
  features?: string[];
  /** Map area: [south, west, north, east]. */
  bounds?: [number, number, number, number];
  newOnly?: boolean;
  openHouse?: boolean;
  newBuild?: boolean;
  sort: ListingSort;
  page: number;
};

export type ListingResults = { listings: Listing[]; total: number; page: number; pageSize: number };

export const PAGE_SIZE = 24;
const NEW_LISTING_DAYS = 7;
const ACRE_SQFT = 43_560;

let connection: DatabaseSync | null = null;

function database() {
  if (connection) return connection;
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DDF_DB_PATH || ".data/ddf.sqlite");
  if (!existsSync(file)) return null;
  try {
    connection = new DatabaseSync(file, { readOnly: true });
    connection.exec("PRAGMA busy_timeout = 5000");
    return connection;
  } catch (error) {
    console.error("Unable to open the DDF listing database.", error);
    return null;
  }
}

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-CA");
const dayFormat = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function slugify(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Extracts the MLS® number from a listing slug ("14-radcliffe-crescent-se-calgary-a2359747" → "a2359747"). */
export function mlsFromSlug(slug: string) {
  const mls = slug.toLowerCase().replace(/\/+$/, "").split("-").at(-1) ?? "";
  return /^[a-z0-9]{4,20}$/.test(mls) ? mls : null;
}

function ageLabel(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) { const h = Math.floor(hours); return `${h} ${h === 1 ? "hour" : "hours"} ago`; }
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

function clock(time: string | null) {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function openHouseLabel(date: string, start: string | null, end: string | null) {
  const [y, m, d] = date.split("-").map(Number);
  const day = dayFormat.format(new Date(Date.UTC(y, m - 1, d)));
  const times = [clock(start), clock(end)].filter(Boolean).join("–");
  return times ? `${day} · ${times}` : day;
}

type Row = {
  listing_key: string;
  listing_id: string | null;
  price: number;
  address: string | null;
  unit_number: string | null;
  city: string | null;
  province: string | null;
  community: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor_area_sqft: number | null;
  property_sub_type: string | null;
  structure_type: string | null;
  remarks: string | null;
  listing_url: string | null;
  display_address: number;
  hours: number;
  open_house_date: string | null;
  photo: string | null;
  photo_count: number;
  brokerage: string | null;
};

const PROVINCE_CODES: Record<string, string> = { Alberta: "AB" };

function toListing(row: Row): Listing {
  const showAddress = row.display_address === 1 && Boolean(row.address);
  const province = row.province ? PROVINCE_CODES[row.province] ?? row.province : "AB";
  const place = [row.community, row.city ? `${row.city}, ${province}` : province].filter(Boolean).join(" · ");
  const mls = row.listing_id ?? row.listing_key;
  const hours = Math.max(0, row.hours);
  const days = Math.floor(hours / 24);
  const age = ageLabel(hours);
  const openHouse = row.open_house_date ? `Open house · ${dayFormat.format(new Date(`${row.open_house_date}T00:00:00Z`))}` : null;
  return {
    id: row.listing_key,
    slug: [showAddress ? row.address! : "home", row.city ?? "alberta", mls].map(slugify).filter(Boolean).join("-"),
    mls,
    price: row.price,
    priceLabel: money.format(row.price),
    address: showAddress ? row.address! : "Address withheld by request",
    area: showAddress ? place : province,
    beds: row.bedrooms,
    baths: row.bathrooms,
    sqft: row.floor_area_sqft,
    type: row.structure_type ?? row.property_sub_type ?? "Residential",
    days,
    ageLabel: age,
    badge: openHouse ?? (days <= NEW_LISTING_DAYS ? `New · ${age}` : null),
    photo: row.photo,
    photoCount: row.photo_count,
    brokerage: row.brokerage,
    listingUrl: row.listing_url ? `https://${row.listing_url.replace(/^https?:\/\//, "")}` : null,
    // Hide the map position when the seller has withheld the address.
    latitude: showAddress ? row.latitude : null,
    longitude: showAddress ? row.longitude : null,
    remarks: row.remarks,
  };
}

// Calgary dates for "upcoming" open houses (MST; close enough for a date boundary).
const TODAY = "date('now', '-7 hours')";

const COLUMNS = `
  l.listing_key, l.listing_id, l.price, l.address, l.unit_number, l.city, l.province, l.community,
    l.latitude, l.longitude, l.bedrooms, l.bathrooms, l.floor_area_sqft, l.property_sub_type, l.structure_type,
    l.remarks, l.listing_url, l.display_address,
    (julianday('now') - julianday(l.listed_at)) * 24 AS hours,
    (SELECT MIN(oh.date) FROM open_houses oh WHERE oh.listing_key = l.listing_key AND oh.date >= ${TODAY}) AS open_house_date,
    (SELECT p.url FROM photos p WHERE p.listing_key = l.listing_key ORDER BY p.preferred DESC, p.position LIMIT 1) AS photo,
    (SELECT COUNT(*) FROM photos p WHERE p.listing_key = l.listing_key) AS photo_count,
    o.name AS brokerage`;
const FROM = "FROM listings l LEFT JOIN offices o ON o.office_key = l.list_office_key";
const SELECT = `SELECT ${COLUMNS} ${FROM}`;

// Residential listings for sale that the listing brokerage allows on the internet.
const BASE_WHERE = [
  "l.display_listing = 1",
  "l.price IS NOT NULL",
  "l.price > 0",
  "l.property_sub_type IN ('Single Family', 'Multi-family')",
];

export function hasLiveListings() {
  const db = database();
  if (!db) return false;
  const row = db.prepare(`SELECT 1 AS found FROM listings l WHERE ${BASE_WHERE.join(" AND ")} LIMIT 1`).get();
  return Boolean(row);
}

export function featuredListings(limit = 3): Listing[] {
  const db = database();
  if (!db) return [];
  const rows = db.prepare(`${SELECT}
    WHERE ${BASE_WHERE.join(" AND ")} AND l.city = 'Calgary' AND l.display_address = 1
      AND EXISTS (SELECT 1 FROM photos p WHERE p.listing_key = l.listing_key)
    ORDER BY l.listed_at DESC LIMIT ?`).all(limit) as Row[];
  return rows.map(toListing);
}

// --- Property types --------------------------------------------------------

type TypeFilter = { label: string; clause: string };

/** Search "property type" options (labels shown in the UI) and how each maps to DDF fields. */
const TYPE_FILTERS: Record<string, TypeFilter> = {
  detached: { label: "Detached", clause: "l.structure_type = 'House'" },
  "semi-detached": { label: "Semi-detached", clause: "l.structure_type = 'Duplex'" },
  duplex: { label: "Semi-detached", clause: "l.structure_type = 'Duplex'" },
  townhouse: { label: "Townhouse", clause: "l.structure_type = 'Row / Townhouse'" },
  condo: { label: "Condo", clause: "l.structure_type = 'Apartment'" },
  bungalow: { label: "Bungalow", clause: "EXISTS (SELECT 1 FROM json_each(l.raw, '$.ArchitecturalStyle') s WHERE s.value = 'Bungalow')" },
  "multi-family": { label: "Multi-family", clause: "l.property_sub_type = 'Multi-family'" },
  mobile: { label: "Mobile", clause: "l.structure_type IN ('Mobile Home', 'Manufactured Home')" },
  acreage: {
    label: "Acreage",
    clause: `(json_extract(l.raw, '$.LotSizeUnits') = 'acres' AND json_extract(l.raw, '$.LotSizeArea') >= 1
      OR json_extract(l.raw, '$.LotSizeUnits') = 'square feet' AND json_extract(l.raw, '$.LotSizeArea') >= ${ACRE_SQFT})`,
  },
};

// --- Calgary zones (quadrants from the street address, plus the inner city) ----

const CENTRE_COMMUNITIES = ["Beltline", "Downtown Commercial Core", "Downtown East Village", "Downtown West End", "Eau Claire", "Chinatown",
  "Mission", "Cliff Bungalow", "Lower Mount Royal", "Victoria Park", "Bridgeland/Riverside", "Inglewood", "Sunnyside", "Hillhurst", "Crescent Heights"];

function quadrant(...suffixes: string[]) {
  return `(${suffixes.map(suffix => `(' ' || l.address || ' ') LIKE '% ${suffix} %'`).join(" OR ")})`;
}

const ZONES: Record<string, { label: string; clause: string }> = {
  NW: { label: "Calgary NW", clause: quadrant("NW") },
  NE: { label: "Calgary NE", clause: quadrant("NE") },
  SW: { label: "Calgary SW", clause: quadrant("SW") },
  SE: { label: "Calgary SE", clause: quadrant("SE") },
  N: { label: "North Calgary", clause: quadrant("NW", "NE") },
  S: { label: "South Calgary", clause: quadrant("SW", "SE") },
  E: { label: "East Calgary", clause: quadrant("NE", "SE") },
  W: { label: "West Calgary", clause: quadrant("NW", "SW") },
  CENTRE: { label: "City Centre", clause: `l.community IN (${CENTRE_COMMUNITIES.map(name => `'${name.replaceAll("'", "''")}'`).join(",")})` },
};

// --- Home features (from the DDF® record) ---------------------------------

const hasAny = (field: string) => `json_array_length(json_extract(l.raw, '$.${field}')) > 0`;
const FEATURE_FILTERS: Record<string, string> = {
  ac: "EXISTS (SELECT 1 FROM json_each(l.raw, '$.Cooling') c WHERE c.value LIKE '%air%' OR c.value LIKE '%wall unit%' OR c.value LIKE '%heat pump%')",
  pool: hasAny("PoolFeatures"),
  waterfront: hasAny("WaterfrontFeatures"),
  view: hasAny("View"),
  fireplace: "json_extract(l.raw, '$.FireplacesTotal') > 0",
  "finished-basement": "EXISTS (SELECT 1 FROM json_each(l.raw, '$.Basement') b WHERE b.value = 'Finished')",
  suite: "EXISTS (SELECT 1 FROM json_each(l.raw, '$.Basement') b WHERE b.value IN ('Suite', 'Separate entrance'))",
};

const escapeLike = (text: string) => `%${text.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

function filterClauses(filters: Omit<ListingFilters, "sort" | "page">) {
  const where = [...BASE_WHERE];
  const values: SQLInputValue[] = [];
  const add = (clause: string, ...params: SQLInputValue[]) => { where.push(clause); values.push(...params); };

  if (filters.city) add("l.city = ? COLLATE NOCASE", filters.city);
  if (filters.query) {
    const like = escapeLike(filters.query);
    add(`(l.display_address = 1 AND (l.address LIKE ? ESCAPE '\\' OR l.community LIKE ? ESCAPE '\\' OR l.postal_code LIKE ? ESCAPE '\\')
      OR l.city LIKE ? ESCAPE '\\' OR l.listing_id LIKE ? ESCAPE '\\')`, like, like, like.replaceAll(" ", ""), like, like);
  }
  const zone = filters.zone ? ZONES[filters.zone.toUpperCase()] : undefined;
  if (zone) add(`l.display_address = 1 AND ${zone.clause}`);
  if (filters.minPrice) add("l.price >= ?", filters.minPrice);
  if (filters.maxPrice) add("l.price <= ?", filters.maxPrice);
  if (filters.minBeds) add("l.bedrooms >= ?", filters.minBeds);
  if (filters.maxBeds) add("l.bedrooms <= ?", filters.maxBeds);
  if (filters.minBaths) add("l.bathrooms >= ?", filters.minBaths);
  if (filters.minSqft) add("l.floor_area_sqft >= ?", filters.minSqft);
  if (filters.maxSqft) add("l.floor_area_sqft <= ?", filters.maxSqft);
  if (filters.minYear) add("l.year_built >= ?", filters.minYear);
  if (filters.newBuild) add("l.year_built >= CAST(strftime('%Y', 'now') AS INTEGER) - 1");
  if (filters.newOnly) add("l.listed_at >= datetime('now', ?)", `-${NEW_LISTING_DAYS} days`);
  if (filters.openHouse) add(`EXISTS (SELECT 1 FROM open_houses oh WHERE oh.listing_key = l.listing_key AND oh.date >= ${TODAY})`);
  if (filters.type) {
    const type = TYPE_FILTERS[slugify(filters.type)];
    if (type) add(type.clause);
  }
  if (filters.maxYear) add("l.year_built <= ?", filters.maxYear);
  if (filters.maxDays) add("l.listed_at >= datetime('now', ?)", `-${filters.maxDays} days`);
  if (filters.minParking) add("json_extract(l.raw, '$.ParkingTotal') >= ?", filters.minParking);
  if (filters.maxFee) add("COALESCE(json_extract(l.raw, '$.AssociationFee'), 0) <= ?", filters.maxFee);
  if (filters.keyword) add("l.remarks LIKE ? ESCAPE '\\'", escapeLike(filters.keyword));
  if (filters.minLotAcres) {
    add(`(json_extract(l.raw, '$.LotSizeUnits') = 'acres' AND json_extract(l.raw, '$.LotSizeArea') >= ?
      OR json_extract(l.raw, '$.LotSizeUnits') = 'square feet' AND json_extract(l.raw, '$.LotSizeArea') >= ?
      OR json_extract(l.raw, '$.LotSizeUnits') = 'square meters' AND json_extract(l.raw, '$.LotSizeArea') >= ?)`,
    filters.minLotAcres, filters.minLotAcres * ACRE_SQFT, filters.minLotAcres * 4046.86);
  }
  for (const feature of filters.features ?? []) if (FEATURE_FILTERS[feature]) add(FEATURE_FILTERS[feature]);
  if (filters.bounds) {
    const [south, west, north, east] = filters.bounds;
    add("l.display_address = 1 AND l.latitude BETWEEN ? AND ? AND l.longitude BETWEEN ? AND ?", south, north, west, east);
  }
  return { whereSql: where.join(" AND "), values };
}

export type MapPoint = { id: string; slug: string; lat: number; lng: number; price: number; label: string; address: string; beds: number | null; baths: number | null; photo: string | null };

/** Located listings matching the filters, for the interactive map (capped; newest first). */
export function mapListings(filters: Omit<ListingFilters, "sort" | "page">, limit = 2500): { points: MapPoint[]; total: number } | null {
  const db = database();
  if (!db) return null;
  const { whereSql, values } = filterClauses(filters);
  const located = `${whereSql} AND l.display_address = 1 AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`;
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM listings l WHERE ${located}`).get(...values) as { count: number }).count;
  const rows = db.prepare(`SELECT l.listing_key, l.listing_id, l.address, l.city, l.price, l.latitude, l.longitude, l.bedrooms, l.bathrooms,
      (SELECT p.url FROM photos p WHERE p.listing_key = l.listing_key ORDER BY p.preferred DESC, p.position LIMIT 1) AS photo
    FROM listings l WHERE ${located} ORDER BY l.listed_at DESC LIMIT ?`).all(...values, limit) as {
      listing_key: string; listing_id: string | null; address: string; city: string | null; price: number; latitude: number; longitude: number;
      bedrooms: number | null; bathrooms: number | null; photo: string | null }[];
  const points = rows.map(row => ({
    id: row.listing_key,
    slug: [row.address, row.city ?? "alberta", row.listing_id ?? row.listing_key].map(slugify).filter(Boolean).join("-"),
    lat: row.latitude, lng: row.longitude, price: row.price, label: money.format(row.price), address: row.address,
    beds: row.bedrooms, baths: row.bathrooms, photo: row.photo,
  }));
  return { points, total };
}

/** Number of listings matching the filters (used for the live "Show N homes" count). */
export function countListings(filters: Omit<ListingFilters, "sort" | "page">): number | null {
  const db = database();
  if (!db) return null;
  const { whereSql, values } = filterClauses(filters);
  return (db.prepare(`SELECT COUNT(*) AS count FROM listings l WHERE ${whereSql}`).get(...values) as { count: number }).count;
}

/** Asking prices of every displayable listing, for the price-filter histogram. */
export function allListingPrices(): number[] {
  const db = database();
  if (!db) return [];
  return (db.prepare(`SELECT l.price FROM listings l WHERE ${BASE_WHERE.join(" AND ")}`).all() as { price: number }[]).map(row => row.price);
}

export function searchListings(filters: ListingFilters): ListingResults | null {
  const db = database();
  if (!db) return null;
  const { whereSql, values } = filterClauses(filters);
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM listings l WHERE ${whereSql}`).get(...values) as { count: number }).count;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pages);
  const order = filters.sort === "low" ? "l.price ASC" : filters.sort === "high" ? "l.price DESC"
    : filters.sort === "sqft" ? "l.floor_area_sqft IS NULL, l.floor_area_sqft DESC"
    : filters.openHouse ? "open_house_date ASC, l.listed_at DESC" : "l.listed_at DESC";
  const rows = db.prepare(`${SELECT} WHERE ${whereSql} ORDER BY ${order}, l.listing_key LIMIT ? OFFSET ?`)
    .all(...values, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Row[];
  return { listings: rows.map(toListing), total, page, pageSize: PAGE_SIZE };
}

export function listingExists(listingKey: string) {
  const db = database();
  if (!db) return false;
  return Boolean(db.prepare("SELECT 1 AS found FROM listings WHERE listing_key = ? AND display_listing = 1").get(listingKey));
}

// --- Listing detail -------------------------------------------------------

export type FactGroup = { title: string; facts: [label: string, value: string][] };
export type Room = { type: string; level: string; size: string };

export type ListingDetail = Listing & {
  photos: string[];
  groups: FactGroup[];
  rooms: Room[];
  openHouses: string[];
  community: string | null;
  city: string | null;
  postalCode: string | null;
  showAddress: boolean;
  yearBuilt: number | null;
  annualTax: number | null;
  monthlyFee: number | null;
  listedAt: string | null;
  modifiedAt: string | null;
};

const KEY_PATTERN = /^\d{1,15}$/;

/** Ordered photo URLs for a displayable listing (empty when unknown or hidden). */
export function listingPhotos(listingKey: string): string[] {
  const db = database();
  if (!db || !KEY_PATTERN.test(listingKey)) return [];
  const rows = db.prepare(`SELECT p.url FROM photos p JOIN listings l ON l.listing_key = p.listing_key
    WHERE p.listing_key = ? AND l.display_listing = 1 ORDER BY p.position`).all(listingKey) as { url: string }[];
  return rows.map(row => row.url);
}

type Raw = Record<string, unknown>;

function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== "").join(", ");
  if (typeof value === "number") return count.format(value);
  return typeof value === "string" ? value.trim() : "";
}

const FREQUENCY_PER_MONTH: Record<string, number> = { monthly: 1, annually: 1 / 12, yearly: 1 / 12, quarterly: 1 / 3, "semi-annually": 1 / 6, weekly: 52 / 12, "bi-weekly": 26 / 12 };

function monthlyFee(raw: Raw) {
  const fee = raw.AssociationFee;
  if (typeof fee !== "number" || fee <= 0) return null;
  const factor = FREQUENCY_PER_MONTH[text(raw.AssociationFeeFrequency).toLowerCase()] ?? 1;
  return Math.round(fee * factor);
}

function factGroups(raw: Raw, listing: Listing, partialBaths: number | null, fee: number | null): FactGroup[] {
  const group = (title: string, entries: [string, unknown][]): FactGroup => ({
    title,
    facts: entries.map(([label, value]) => [label, text(value)] as [string, string]).filter(([, value]) => value),
  });
  const bedsSplit = typeof raw.BedroomsAboveGrade === "number" || typeof raw.BedroomsBelowGrade === "number"
    ? `${raw.BedroomsAboveGrade ?? 0} / ${raw.BedroomsBelowGrade ?? 0}` : "";
  const lot = typeof raw.LotSizeArea === "number" && raw.LotSizeArea > 0 ? `${count.format(raw.LotSizeArea)} ${text(raw.LotSizeUnits)}`.trim() : "";
  const frontage = typeof raw.FrontageLengthNumeric === "number" ? `${count.format(raw.FrontageLengthNumeric)} ${text(raw.FrontageLengthNumericUnits)}`.trim() : "";
  const tax = typeof raw.TaxAnnualAmount === "number" && raw.TaxAnnualAmount > 0 ? `${money.format(raw.TaxAnnualAmount)}${raw.TaxYear ? ` (${raw.TaxYear})` : ""}` : "";
  const fees = fee ? `${money.format(fee)} / month${text(raw.AssociationFeeIncludes) ? ` (includes ${text(raw.AssociationFeeIncludes).toLowerCase()})` : ""}` : "";

  return [
    group("Building", [
      ["Property type", listing.type], ["Ownership", raw.CommonInterest], ["Style", raw.ArchitecturalStyle],
      ["Year built", typeof raw.YearBuilt === "number" ? String(raw.YearBuilt) : ""], ["Storeys", typeof raw.Stories === "number" ? String(raw.Stories) : ""],
      ["Living area", listing.sqft ? `${count.format(listing.sqft)} sq ft` : ""],
      ["Bedrooms", listing.beds], ["Bedrooms above / below grade", bedsSplit],
      ["Bathrooms", listing.baths === null ? "" : partialBaths ? `${listing.baths} (${partialBaths} partial)` : listing.baths],
      ["Basement", raw.Basement], ["Foundation", raw.FoundationDetails], ["Construction", raw.ConstructionMaterials],
      ["Exterior", raw.ExteriorFeatures], ["Roof", raw.Roof], ["Flooring", raw.Flooring],
    ]),
    group("Interior", [
      ["Heating", raw.Heating], ["Cooling", raw.Cooling], ["Fireplaces", raw.FireplacesTotal], ["Fireplace", raw.FireplaceFeatures],
      ["Appliances", raw.Appliances], ["Included", raw.Inclusions], ["Accessibility", raw.AccessibilityFeatures],
    ]),
    group("Land & parking", [
      ["Lot size", lot], ["Lot dimensions", raw.LotSizeDimensions], ["Frontage", frontage], ["Lot features", raw.LotFeatures],
      ["Fencing", raw.Fencing], ["Parking", raw.ParkingFeatures], ["Parking spaces", raw.ParkingTotal],
      ["View", raw.View], ["Waterfront", raw.WaterfrontFeatures], ["Community features", raw.CommunityFeatures],
    ]),
    group("Costs & community", [
      ["Property taxes", tax], ["Condo / association fee", fees], ["Zoning", raw.ZoningDescription ?? raw.Zoning],
      ["Community", listing.area.split(" · ")[0] !== listing.area ? listing.area.split(" · ")[0] : ""],
      ["Days on market", String(listing.days)], ["MLS® number", listing.mls], ["Board", raw.OriginatingSystemName],
    ]),
  ].filter(item => item.facts.length);
}

function roomList(raw: Raw): Room[] {
  if (!Array.isArray(raw.Rooms)) return [];
  // Main floor first, then upper floors, then lower floors (as on the previous site).
  const order = ["main level", "second level", "third level", "upper level", "lower level", "basement"];
  const rank = (level: string) => { const i = order.indexOf(level.toLowerCase()); return i < 0 ? order.length : i; };
  return (raw.Rooms as Raw[])
    .map(room => ({ type: text(room.RoomType), level: text(room.RoomLevel), size: text(room.RoomDimensions) }))
    .filter(room => room.type)
    .sort((a, b) => rank(a.level) - rank(b.level));
}

type DetailRow = Row & { raw: string | null; bathrooms_partial: number | null; postal_code: string | null; year_built: number | null; listed_at: string | null; modified_at: string | null };

/** Full listing by MLS® number, or null when it no longer exists or may not be displayed. */
export function listingByMls(mls: string): ListingDetail | null {
  const db = database();
  if (!db || !/^[a-z0-9]{4,20}$/i.test(mls)) return null;
  const row = db.prepare(`SELECT ${COLUMNS}, l.raw, l.bathrooms_partial, l.postal_code, l.year_built, l.listed_at, l.modified_at ${FROM}
    WHERE l.listing_id = ? COLLATE NOCASE AND ${BASE_WHERE.join(" AND ")} LIMIT 1`).get(mls) as DetailRow | undefined;
  if (!row) return null;
  const listing = toListing(row);
  let raw: Raw = {};
  try { raw = row.raw ? JSON.parse(row.raw) as Raw : {}; } catch { /* keep empty */ }
  const fee = monthlyFee(raw);
  const showAddress = row.display_address === 1 && Boolean(row.address);
  const openHouses = (db.prepare(`SELECT date, start_time, end_time FROM open_houses WHERE listing_key = ? AND date >= ${TODAY} ORDER BY date, start_time`)
    .all(row.listing_key) as { date: string; start_time: string | null; end_time: string | null }[])
    .map(item => openHouseLabel(item.date, item.start_time, item.end_time));
  return {
    ...listing,
    photos: listingPhotos(row.listing_key),
    groups: factGroups(raw, listing, row.bathrooms_partial, fee),
    rooms: roomList(raw),
    openHouses,
    community: showAddress ? row.community : null,
    city: row.city,
    postalCode: showAddress ? row.postal_code : null,
    showAddress,
    yearBuilt: row.year_built,
    annualTax: typeof raw.TaxAnnualAmount === "number" && raw.TaxAnnualAmount > 0 ? raw.TaxAnnualAmount : null,
    monthlyFee: fee,
    listedAt: row.listed_at,
    modifiedAt: row.modified_at,
  };
}

/** Other homes in the same community (or city) for the listing page. */
export function similarListings(listing: ListingDetail, limit = 3): Listing[] {
  const db = database();
  if (!db) return [];
  const scope = listing.community ? ["l.community = ?", listing.community] as const : listing.city ? ["l.city = ?", listing.city] as const : null;
  if (!scope) return [];
  const rows = db.prepare(`${SELECT} WHERE ${BASE_WHERE.join(" AND ")} AND ${scope[0]} AND l.listing_key <> ? AND l.display_address = 1
    ORDER BY ABS(l.price - ?) LIMIT ?`).all(scope[1], listing.id, listing.price, limit) as Row[];
  return rows.map(toListing);
}

/** Every displayable listing's slug and last change, for the XML sitemap. */
export function sitemapListings(): { slug: string; modifiedAt: string | null }[] {
  const db = database();
  if (!db) return [];
  const rows = db.prepare(`SELECT l.listing_key, l.listing_id, l.address, l.city, l.display_address, l.modified_at FROM listings l
    WHERE ${BASE_WHERE.join(" AND ")} ORDER BY l.listed_at DESC`).all() as { listing_key: string; listing_id: string | null; address: string | null; city: string | null; display_address: number; modified_at: string | null }[];
  return rows.map(row => ({
    slug: [row.display_address === 1 && row.address ? row.address : "home", row.city ?? "alberta", row.listing_id ?? row.listing_key].map(slugify).filter(Boolean).join("-"),
    modifiedAt: row.modified_at,
  }));
}

// ---------------------------------------------------------------------------
// Query-string parsing shared by the homepage forms, the search page and the
// previous site's links (/real-estate-listing/?keyword=…&property_type=…).
// ---------------------------------------------------------------------------

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

function amount(label: string) {
  const match = label.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!match) return undefined;
  const multiplier = match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function priceRange(label: string): [number | undefined, number | undefined] {
  if (!label || /^any|^no /i.test(label)) return [undefined, undefined];
  const parts = label.split(/[–—-]|\bto\b/i).map((part) => part.trim()).filter(Boolean);
  if (/^under/i.test(label)) return [undefined, amount(label)];
  if (label.trim().endsWith("+")) return [amount(label), undefined];
  if (parts.length === 2) return [amount(parts[0]), amount(parts[1])];
  return [undefined, undefined];
}

function minimum(label: string) {
  if (!label || /^any|^no /i.test(label)) return undefined;
  const value = amount(label);
  return value && value > 0 ? value : undefined;
}

const SORT_ALIASES: Record<string, ListingSort> = { low: "low", priceasc: "low", high: "high", pricedesc: "high", sqft: "sqft", newest: "newest" };

function parseBounds(text: string): [number, number, number, number] | undefined {
  const parts = text.split(",").map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) return undefined;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east || Math.abs(south) > 90 || Math.abs(north) > 90 || Math.abs(west) > 180 || Math.abs(east) > 180) return undefined;
  return [south, west, north, east];
}

export function parseListingFilters(params: Params): ListingFilters {
  const get = (...keys: string[]) => keys.map(key => first(params[key])).find(Boolean) ?? "";
  const [rangeMin, rangeMax] = priceRange(get("price"));
  const type = get("type", "property_type");
  const status = get("status").toLowerCase();
  const features = get("features").toLowerCase();
  const query = get("query", "keyword", "q", "kw", "mls");
  // "Calgary NW" from the city list means Calgary, north-west quadrant.
  let city = /^any/i.test(get("city")) ? "" : get("city");
  let zone = get("zone").toUpperCase();
  const quadrantCity = city.match(/^calgary\s+(nw|ne|sw|se)$/i);
  if (quadrantCity) { city = "Calgary"; zone ||= quadrantCity[1].toUpperCase(); }
  let minPrice = minimum(get("min", "min_price", "minPrice")) ?? rangeMin;
  let maxPrice = minimum(get("max", "max_price", "maxPrice")) ?? rangeMax;
  if (minPrice && maxPrice && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    city: city ? city.slice(0, 60) : undefined,
    query: query.slice(0, 80) || undefined,
    zone: zone && ZONES[zone] ? zone : undefined,
    minPrice,
    maxPrice,
    minBeds: minimum(get("beds")),
    maxBeds: minimum(get("maxBeds")),
    minBaths: minimum(get("baths")),
    type: type && !/^all|^any/i.test(type) ? type : undefined,
    minSqft: minimum(get("sqft", "minSqft")),
    maxSqft: minimum(get("maxSqft")),
    minYear: minimum(get("year", "minYear")),
    maxYear: minimum(get("maxYear")),
    minLotAcres: Number(get("lot")) > 0 ? Math.min(Number(get("lot")), 1000) : undefined,
    maxDays: minimum(get("days")),
    minParking: minimum(get("parking")),
    maxFee: minimum(get("fee")),
    keyword: get("text").slice(0, 60) || undefined,
    features: features.split(",").map(item => item.trim()).filter(item => item in FEATURE_FILTERS),
    bounds: parseBounds(get("bounds")),
    newOnly: get("new") === "1" || status === "new",
    openHouse: get("openhouse") === "1" || status === "open-house",
    newBuild: features.includes("new-build"),
    sort: SORT_ALIASES[get("sort").toLowerCase()] ?? "newest",
    page: Math.max(1, Math.floor(Number(get("page", "pg")) || 1)),
  };
}

/** Display label for a property-type filter ("duplex" → "Semi-detached"). */
export function propertyTypeLabel(type?: string) {
  return type ? TYPE_FILTERS[slugify(type)]?.label : undefined;
}

export function describeZone(zone?: string) {
  return zone ? ZONES[zone.toUpperCase()]?.label : undefined;
}


// ---------------------------------------------------------------------------
// Market data for the Sell and Buy pages (all from current active listings).
// ---------------------------------------------------------------------------

const percentile = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : 0;

export type MarketStats = { total: number; fresh: number; medianPrice: number; medianDays: number };

/** Headline numbers: homes for sale, new this week, typical price, typical days on market. */
export function marketStats(): MarketStats | null {
  const db = database();
  if (!db) return null;
  const rows = db.prepare(`SELECT l.price, (julianday('now') - julianday(l.listed_at)) AS days FROM listings l WHERE ${BASE_WHERE.join(" AND ")}`).all() as { price: number; days: number | null }[];
  const prices = rows.map(row => row.price).sort((a, b) => a - b);
  const days = rows.map(row => row.days ?? 0).filter(value => value >= 0).sort((a, b) => a - b);
  return { total: rows.length, fresh: days.filter(value => value <= NEW_LISTING_DAYS).length, medianPrice: percentile(prices, 0.5), medianDays: Math.round(percentile(days, 0.5)) };
}

export type CommunitySnapshot = { community: string; city: string; count: number; medianPrice: number; medianPpsf: number | null };

/** Busiest communities with their typical asking price and price per square foot. */
export function communitySnapshot(limit = 10): CommunitySnapshot[] {
  const db = database();
  if (!db) return [];
  const rows = db.prepare(`SELECT l.community, l.city, l.price, l.floor_area_sqft AS sqft FROM listings l
    WHERE ${BASE_WHERE.join(" AND ")} AND l.community IS NOT NULL AND l.community <> ''`).all() as { community: string; city: string; price: number; sqft: number | null }[];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) { const key = `${row.community}|${row.city}`; const list = groups.get(key); if (list) list.push(row); else groups.set(key, [row]); }
  return [...groups.values()].sort((a, b) => b.length - a.length).slice(0, limit).map(list => {
    const prices = list.map(row => row.price).sort((a, b) => a - b);
    const ppsf = list.filter(row => row.sqft && row.sqft > 300).map(row => row.price / row.sqft!).sort((a, b) => a - b);
    return { community: list[0].community, city: list[0].city, count: list.length, medianPrice: percentile(prices, 0.5), medianPpsf: ppsf.length >= 3 ? Math.round(percentile(ppsf, 0.5)) : null };
  });
}

/** Communities with enough listings to estimate from (for the home value picker). */
export function estimateCommunities(): { community: string; city: string; count: number }[] {
  const db = database();
  if (!db) return [];
  const rows = db.prepare(`SELECT l.community, l.city, COUNT(*) AS count FROM listings l WHERE ${BASE_WHERE.join(" AND ")} AND l.community IS NOT NULL AND l.community <> ''
    GROUP BY l.community, l.city HAVING COUNT(*) >= 3 ORDER BY l.community`).all() as { community: string; city: string; count: number }[];
  // SQLite rows have a null prototype; plain objects are needed to pass them to client components.
  return rows.map(row => ({ community: row.community, city: row.city, count: row.count }));
}

export type ValueEstimate = { low: number; mid: number; high: number; basis: string; sample: number; comparables: Listing[] };

/**
 * Rough value range from comparable homes currently for sale: same community and type
 * where possible, widening to the community, then the city. Uses price per square foot
 * when a size is given, otherwise prices of homes with a similar number of bedrooms.
 */
export function estimateValue(input: { community?: string; city?: string; type?: string; beds?: number; sqft?: number }): ValueEstimate | null {
  const db = database();
  if (!db) return null;
  const type = input.type ? TYPE_FILTERS[slugify(input.type)] : undefined;
  const scopes: { where: string[]; values: SQLInputValue[]; label: string }[] = [];
  if (input.community && type) scopes.push({ where: ["l.community = ?", type.clause], values: [input.community], label: `${type.label.toLowerCase()} listings in ${input.community}` });
  if (input.community) scopes.push({ where: ["l.community = ?"], values: [input.community], label: `listings in ${input.community}` });
  const city = input.city || "Calgary";
  if (type) scopes.push({ where: ["l.city = ?", type.clause], values: [city], label: `${type.label.toLowerCase()} listings in ${city}` });
  scopes.push({ where: ["l.city = ?"], values: [city], label: `listings in ${city}` });

  type CompRow = { listing_key: string; price: number; sqft: number | null; beds: number | null };
  for (const scope of scopes) {
    let rows = db.prepare(`SELECT l.listing_key, l.price, l.floor_area_sqft AS sqft, l.bedrooms AS beds FROM listings l
      WHERE ${[...BASE_WHERE, ...scope.where].join(" AND ")}`).all(...scope.values) as CompRow[];
    if (input.beds) {
      const similar = rows.filter(row => row.beds !== null && Math.abs(row.beds - input.beds!) <= 1);
      if (similar.length >= 4) rows = similar;
    }
    let low: number, mid: number, high: number, sample: number, pick: (row: CompRow) => number;
    if (input.sqft && input.sqft > 200) {
      const sized = rows.filter(row => row.sqft && row.sqft > 300);
      if (sized.length < 4) continue;
      const ppsf = sized.map(row => row.price / row.sqft!).sort((a, b) => a - b);
      [low, mid, high] = [0.25, 0.5, 0.75].map(q => percentile(ppsf, q) * input.sqft!);
      sample = sized.length;
      rows = sized;
      pick = row => Math.abs((row.sqft ?? 0) - input.sqft!);
    } else {
      if (rows.length < 4) continue;
      const prices = rows.map(row => row.price).sort((a, b) => a - b);
      [low, mid, high] = [0.25, 0.5, 0.75].map(q => percentile(prices, q));
      sample = rows.length;
      pick = row => Math.abs(row.price - mid);
    }
    const keys = [...rows].sort((a, b) => pick(a) - pick(b)).slice(0, 3).map(row => row.listing_key);
    const comparables = keys.length ? (db.prepare(`${SELECT} WHERE l.listing_key IN (${keys.map(() => "?").join(",")})`).all(...keys) as Row[]).map(toListing) : [];
    const round = (value: number) => Math.round(value / 5000) * 5000;
    return { low: round(low), mid: round(mid), high: round(high), basis: scope.label, sample, comparables };
  }
  return null;
}
