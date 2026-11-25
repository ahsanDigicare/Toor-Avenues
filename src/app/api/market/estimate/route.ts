import { estimateValue, provinceName } from "../../../../lib/listings";

// Home value range from comparable active listings (Sell page estimator).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const number = (key: string) => { const value = Number(params.get(key)); return Number.isFinite(value) && value > 0 ? value : undefined; };
  const estimate = await estimateValue({
    community: params.get("community")?.slice(0, 80) || undefined,
    city: params.get("city")?.slice(0, 60) || undefined,
    province: provinceName(params.get("province") ?? undefined),
    type: params.get("type")?.slice(0, 40) || undefined,
    beds: number("beds"),
    sqft: number("sqft"),
  });
  if (!estimate) return Response.json({ estimate: null }, { status: 404 });
  return Response.json({ estimate }, { headers: { "Cache-Control": "public, max-age=300" } });
}
