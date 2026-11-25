import type { MetadataRoute } from "next";
import { listingSitemapCount } from "./listing-sitemaps";

const SITE = process.env.SITE_URL || "https://tooravenues.com";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const files = await listingSitemapCount();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: [`${SITE}/sitemap.xml`, ...Array.from({ length: files }, (_, id) => `${SITE}/listings/sitemap/${id}.xml`)],
  };
}
