import { countListings, parseListingFilters } from "../../../../lib/listings";

// Live result count for the search filters ("Show 1,234 homes") while a visitor adjusts them.
export async function GET(request: Request) {
  const params: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => { params[key] = value; });
  const total = countListings(parseListingFilters(params));
  if (total === null) return Response.json({ total: null }, { status: 503 });
  return Response.json({ total }, { headers: { "Cache-Control": "public, max-age=60" } });
}
