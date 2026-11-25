import "server-only";

import { cacheLife } from "next/cache";
import { getMarket } from "../lib/listings";

// Cached views of the market summary the sync stores (scripts/market.mjs). It changes
// only when the sync runs (every few hours), so pages re-read it at most hourly.

export async function cachedMarket() {
  "use cache";
  cacheLife("hours");
  return getMarket();
}

/** City suggestions for search boxes ("Toronto, ON"), busiest first, and provinces with homes for sale. */
export async function searchSuggestions() {
  "use cache";
  cacheLife("hours");
  const market = await getMarket();
  return {
    cities: market?.cities.slice(0, 500).map(city => `${city.city}, ${city.code}`) ?? [],
    provinces: market?.provinces.map(province => province.name) ?? [],
  };
}

/** Province of a city named without one ("Calgary" → "Alberta"), using the busiest match. */
export async function provinceOfCity(city: string) {
  const market = await cachedMarket();
  return market?.cities.find(item => item.city.toLowerCase() === city.toLowerCase())?.province;
}
