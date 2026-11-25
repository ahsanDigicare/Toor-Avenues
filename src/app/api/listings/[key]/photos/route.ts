import { listingPhotos } from "../../../../../lib/listings";

// Ordered DDF® photo URLs for one listing, used by the search pop-up gallery.
export async function GET(_request: Request, { params }: RouteContext<"/api/listings/[key]/photos">) {
  const { key } = await params;
  const photos = listingPhotos(key);
  if (!photos.length) return Response.json({ photos: [] }, { status: 404 });
  return Response.json({ photos }, { headers: { "Cache-Control": "public, max-age=300" } });
}
