import { estimateCommunities, provinceName } from "../../../../lib/listings";

// Communities in one city with enough homes for sale to estimate from (Sell page estimator).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = params.get("city")?.slice(0, 60) ?? "";
  if (!city) return Response.json({ communities: [] }, { status: 400 });
  const communities = await estimateCommunities(city, provinceName(params.get("province") ?? undefined));
  return Response.json({ communities }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
