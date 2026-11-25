import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { sitemapListings } from "../../lib/listings";
import { listingSitemapCount, LISTINGS_PER_SITEMAP } from "../listing-sitemaps";

const SITE = process.env.SITE_URL || "https://tooravenues.com";

// Every current listing (/listing/{address}-{city}-{mls}), 40,000 per file at
// /listings/sitemap/{id}.xml. Refreshed hourly so sold and expired listings drop out.
export async function generateSitemaps() {
  return Array.from({ length: await listingSitemapCount() }, (_, id) => ({ id }));
}

async function entries(id: number): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  const listings = await sitemapListings(id * LISTINGS_PER_SITEMAP, LISTINGS_PER_SITEMAP);
  return listings.map(listing => ({ url: `${SITE}/listing/${listing.slug}`, lastModified: listing.modifiedAt ?? undefined, changeFrequency: "daily" as const, priority: 0.6 }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  return entries(Number(await props.id) || 0);
}
