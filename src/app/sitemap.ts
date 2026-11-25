import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { sitemapListings } from "../lib/listings";

const SITE = process.env.SITE_URL || "https://tooravenues.com";
const PAGES = ["", "/search", "/buy", "/sell", "/about", "/services", "/contact", "/privacy-policy"];

// Every page plus each current listing (/listing/{address}-{city}-{mls}); refreshed hourly
// so sold and expired listings drop out after each sync.
async function entries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  return [
    ...PAGES.map(page => ({ url: `${SITE}${page}`, changeFrequency: page === "/search" ? "hourly" as const : "monthly" as const, priority: page ? 0.7 : 1 })),
    ...(await sitemapListings()).map(listing => ({ url: `${SITE}/listing/${listing.slug}`, lastModified: listing.modifiedAt ?? undefined, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return entries();
}
