import { mapListings, parseListingFilters } from "../../../../lib/listings";

// Map pins for the current search (located listings only, newest first, capped).
export async function GET(request: Request) {
  const params: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => { params[key] = value; });
  const { bounds: _ignored, ...filters } = parseListingFilters(params);
  void _ignored; // the map always shows the whole search; "search this area" narrows the list
  const result = mapListings(filters);
  if (!result) return Response.json({ points: [], total: 0 }, { status: 503 });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=60" } });
}
