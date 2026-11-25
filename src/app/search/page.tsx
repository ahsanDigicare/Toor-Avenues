import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { allListingPrices, countListings, hasLiveListings, parseListingFilters, propertyTypeLabel, searchListings } from "../../lib/listings";
import { PRICE_STEPS, cityLabel } from "../../lib/search-options";
import { DdfNotice } from "../ddf-notice";
import { ListingFilter, type FilterState } from "../listing-filter";
import { PropertyExplorer } from "../real-estate-tools";
import { InnerPage } from "../site-components";

export const metadata: Metadata = { title: "Search Calgary Homes for Sale | ToorAvenues", description: "Explore Calgary homes and prepare a personalized property search with the ToorAvenues team." };

type SearchParams = PageProps<"/search">["searchParams"];
type Params = Awaited<SearchParams>;

// Filters carried through sort and pagination links (sort/page themselves are added per link).
// Includes the previous site's parameter names so old links keep their filters when paging.
const FILTER_FIELDS = ["city", "query", "price", "beds", "baths", "type", "sqft", "year", "new", "openhouse", "min", "max", "zone",
  "status", "features", "keyword", "q", "kw", "mls", "property_type", "min_price", "max_price", "minPrice", "maxPrice", "maxBeds",
  "minSqft", "maxSqft", "minYear", "maxYear", "lot", "days", "parking", "fee", "text", "bounds"] as const;

function value(params: Params, key: string) {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}

// Listing counts per price-slider step for the price histogram (refreshed hourly).
async function priceHistogram() {
  "use cache";
  cacheLife("hours");
  const bins = PRICE_STEPS.map(() => 0);
  for (const price of allListingPrices()) {
    const next = PRICE_STEPS.findIndex(step => step > price);
    bins[next < 0 ? PRICE_STEPS.length - 1 : Math.max(0, next - 1)]++;
  }
  return bins;
}

// The filter card shows the filters actually applied, whichever link or form produced them
// (homepage search, price tabs, budget range, community links, the previous site's URLs).
async function SearchForm({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseListingFilters(params);
  const city = cityLabel(filters.city, filters.zone);
  const text = (n?: number) => n ? String(n) : "";
  const initial: FilterState = {
    query: filters.query ?? "",
    city: filters.city || filters.zone ? city ?? filters.city ?? "" : "",
    status: filters.openHouse ? "open-house" : filters.newOnly ? "new" : "",
    min: text(filters.minPrice),
    max: text(filters.maxPrice),
    beds: text(filters.minBeds),
    baths: text(filters.minBaths),
    type: propertyTypeLabel(filters.type) ?? "",
    sqft: text(filters.minSqft),
    maxSqft: text(filters.maxSqft),
    year: text(filters.minYear),
    maxYear: text(filters.maxYear),
    lot: text(filters.minLotAcres),
    days: text(filters.maxDays),
    parking: text(filters.minParking),
    features: [...(filters.features ?? []), ...(filters.newBuild ? ["new-build"] : [])],
    text: filters.keyword ?? "",
    fee: text(filters.maxFee),
  };
  // Filters without a visible control are carried along so a new search keeps them.
  const hidden: Record<string, string> = {};
  if (filters.zone && city === null) hidden.zone = filters.zone;
  if (filters.maxBeds) hidden.maxBeds = String(filters.maxBeds);
  if (filters.bounds) hidden.bounds = filters.bounds.join(",");
  const [bins, total] = [await priceHistogram(), countListings(filters)];
  return <ListingFilter key={JSON.stringify([initial, hidden])} initial={initial} hidden={hidden} priceBins={bins} initialTotal={total} initialPanel={value(params, "more") === "1" ? "more" : null} />;
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseListingFilters(params);
  const results = searchListings(filters);
  if (!results) return <PropertyExplorer initialView={value(params, "view") === "map" ? "map" : "list"} />;
  const query = new URLSearchParams(FILTER_FIELDS.map(key => [key, value(params, key)] as [string, string]).filter(([, v]) => v)).toString();
  return <>
    <PropertyExplorer listings={results.listings} total={results.total} page={results.page} pageSize={results.pageSize} sort={filters.sort} query={query} initialView={value(params, "view") === "map" ? "map" : "list"} bounds={filters.bounds?.join(",")} />
    <DdfNotice />
  </>;
}

async function IntroCopy() {
  "use cache";
  cacheLife("hours");
  return hasLiveListings()
    ? <><h2>Explore Calgary real estate.</h2><span>Current MLS® System listings across Calgary and surrounding communities, updated regularly from the REALTOR.ca DDF®.</span></>
    : <><h2>Start exploring Calgary real estate.</h2><span>These examples preview the search experience. Live IDX data will replace them before launch.</span></>;
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return <InnerPage><section className="search-route-hero"><div className="shell"><p>CALGARY &amp; SURROUNDING AREAS</p><h1>Find a home that fits what comes next.</h1><span>Explore homes for sale, then connect with our team for guided tours and personal advice.</span></div><Suspense fallback={<ListingFilter />}><SearchForm searchParams={searchParams} /></Suspense></section>
    <section className="search-results-page shell"><div className="intro-grid"><p>HOMES FOR SALE</p><div><IntroCopy /></div></div><Suspense fallback={<div id="listing-results" aria-busy="true" />}><Results searchParams={searchParams} /></Suspense></section></InnerPage>;
}

