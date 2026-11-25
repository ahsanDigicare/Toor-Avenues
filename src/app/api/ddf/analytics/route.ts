import { cookies } from "next/headers";
import { after } from "next/server";
import { listingExists } from "../../../../lib/listings";

// Records a CREA DDF® analytics "View" event when a visitor opens a listing.
// Documented at https://ddfapi-docs.realtor.ca/ (Analytics). Requests are
// best-effort and sent after the response; the visitor's IP is not forwarded.
const ENDPOINT = "https://analytics.crea.ca/LogEvents.svc/LogEvents";
const VISITOR_COOKIE = "ta_visitor";

export async function POST(request: Request) {
  const destinationId = process.env.DDF_DESTINATION_ID;
  if (!destinationId || !/^\d+$/.test(destinationId)) return new Response(null, { status: 204 });

  const body = await request.json().catch(() => null) as { listingKey?: unknown } | null;
  const listingKey = typeof body?.listingKey === "string" ? body.listingKey : "";
  if (!/^\d{1,15}$/.test(listingKey) || !(await listingExists(listingKey))) return new Response(null, { status: 400 });

  const cookieStore = await cookies();
  let visitor = cookieStore.get(VISITOR_COOKIE)?.value ?? "";
  if (!/^[0-9a-f-]{36}$/.test(visitor)) {
    visitor = crypto.randomUUID();
    cookieStore.set(VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("ListingID", listingKey);
  url.searchParams.set("DestinationID", destinationId);
  url.searchParams.set("EventType", "View");
  // "GUID or device identifier with the Destination ID appended."
  url.searchParams.set("UUID", `${visitor}${destinationId}`);
  url.searchParams.set("LanguageID", "1");
  const referer = request.headers.get("referer");
  if (referer) url.searchParams.set("ReferralURL", referer);

  after(async () => {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5_000) });
    } catch {
      // Analytics must never affect the visitor's experience.
    }
  });
  return new Response(null, { status: 204 });
}
