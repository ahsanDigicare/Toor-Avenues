// Filter options shared by the homepage search, the budget picker and the /search form,
// so a value chosen in one place is always recognised (and shown) in the others.
// Every label here is understood by parseListingFilters() in ./listings.

export const CITY_OPTIONS = ["Any city", "Calgary", "Calgary NW", "Calgary NE", "Calgary SW", "Calgary SE", "Airdrie", "Chestermere", "Cochrane"];
export const PRICE_OPTIONS = ["Any price", "Under $250K", "$250K–$500K", "$500K–$750K", "$750K–$1M", "$1M+"];
export const BED_OPTIONS = ["Any", "1+", "2+", "3+", "4+", "5+"];
export const BATH_OPTIONS = ["Any", "1+", "2+", "3+", "4+"];
export const MIN_PRICE_OPTIONS = ["No minimum", "$250,000", "$500,000", "$750,000", "$1,000,000"];
export const MAX_PRICE_OPTIONS = ["No maximum", "$250,000", "$500,000", "$750,000", "$1,000,000", "$1,500,000"];
export const YEAR_OPTIONS = ["Any year", "2020 or newer", "2010 or newer", "2000 or newer"];
export const PROPERTY_TYPES = ["All types", "Detached", "Semi-detached", "Townhouse", "Condo", "Bungalow", "Multi-family", "Mobile", "Acreage"];

/** Calgary quadrants that can be picked from the city list as "Calgary NW" etc. */
export const CITY_QUADRANTS = ["NW", "NE", "SW", "SE"];

function shortMoney(value: number) {
  return value >= 1_000_000 ? `$${Number((value / 1_000_000).toFixed(2))}M` : `$${Math.round(value / 1000)}K`;
}

/** Price-range label for a min/max pair ("Under $500K", "$500K–$750K", "$1M+", "Any price"). */
export function priceRangeLabel(min?: number, max?: number) {
  if (min && max) return `${shortMoney(min)}–${shortMoney(max)}`;
  if (max) return `Under ${shortMoney(max)}`;
  if (min) return `${shortMoney(min)}+`;
  return PRICE_OPTIONS[0];
}

/** City label for a city/zone pair; null when the zone can't be shown in the city list. */
export function cityLabel(city?: string, zone?: string) {
  if (zone) return (!city || /^calgary$/i.test(city)) && CITY_QUADRANTS.includes(zone) ? `Calgary ${zone}` : null;
  if (!city) return CITY_OPTIONS[0];
  return CITY_OPTIONS.find(option => option.toLowerCase() === city.toLowerCase()) ?? city;
}

// --- Search page filter panels ---------------------------------------------

/** Price slider stops. The first means "no minimum" and the last "no maximum" ($10M+). */
export const PRICE_STEPS = [
  0, 100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000, 550_000, 600_000, 650_000, 700_000,
  750_000, 800_000, 850_000, 900_000, 950_000, 1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000, 1_500_000,
  1_750_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000, 5_000_000, 7_500_000, 10_000_000,
];

export const PRICE_PRESETS = [
  { label: "Under $400K", min: 0, max: 400_000 },
  { label: "$400K – $600K", min: 400_000, max: 600_000 },
  { label: "$600K – $800K", min: 600_000, max: 800_000 },
  { label: "$800K – $1M", min: 800_000, max: 1_000_000 },
  { label: "$1M +", min: 1_000_000, max: 0 },
];

export const STATUS_CHOICES = [
  { value: "", title: "All homes for sale", copy: "Every active MLS® listing" },
  { value: "new", title: "New listings", copy: "Listed in the last 7 days" },
  { value: "open-house", title: "Open houses", copy: "With an upcoming open house" },
];

export const TYPE_CHOICES = [
  { value: "Detached", title: "House", copy: "Single-family home", icon: "house" },
  { value: "Semi-detached", title: "Semi-detached", copy: "One shared wall", icon: "semi" },
  { value: "Townhouse", title: "Townhouse", copy: "Row home, multi-level", icon: "town" },
  { value: "Condo", title: "Condo", copy: "Apartment-style", icon: "condo" },
  { value: "Bungalow", title: "Bungalow", copy: "Single-level living", icon: "bungalow" },
  { value: "Multi-family", title: "Multi-family", copy: "Duplex, fourplex +", icon: "multi" },
  { value: "Mobile", title: "Mobile", copy: "Manufactured home", icon: "mobile" },
  { value: "Acreage", title: "Acreage", copy: "One acre or more", icon: "land" },
] as const;

export const FEATURE_CHOICES = [
  { value: "ac", label: "Air conditioning" },
  { value: "fireplace", label: "Fireplace" },
  { value: "finished-basement", label: "Finished basement" },
  { value: "suite", label: "Basement suite / separate entrance" },
  { value: "view", label: "Has a view" },
  { value: "waterfront", label: "Waterfront" },
  { value: "pool", label: "Pool" },
];

export const SQFT_STEPS = [500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000];
export const LOT_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20];
export const YEAR_STEPS = [1950, 1960, 1970, 1980, 1990, 2000, 2005, 2010, 2015, 2020, 2023, 2025];
export const DAY_STEPS = [1, 3, 7, 14, 30, 60, 90];
export const FEE_STEPS = [200, 300, 400, 500, 600, 750, 1000];
export const PARKING_OPTIONS = ["Any", "1+", "2+", "3+", "4+", "5+"];


/** Every search filter as form values (empty string = not set). */
export type FilterState = {
  query: string; city: string; status: string; min: string; max: string; beds: string; baths: string; type: string;
  sqft: string; maxSqft: string; year: string; maxYear: string; lot: string; days: string; parking: string;
  features: string[]; text: string; fee: string;
};

export const EMPTY_FILTERS: FilterState = {
  query: "", city: "", status: "", min: "", max: "", beds: "", baths: "", type: "", sqft: "", maxSqft: "", year: "",
  maxYear: "", lot: "", days: "", parking: "", features: [], text: "", fee: "",
};
