import type { MetadataRoute } from "next";

const SITE = process.env.SITE_URL || "https://tooravenues.com";
const PAGES = ["", "/search", "/buy", "/sell", "/about", "/services", "/contact", "/privacy-policy"];

// The site's pages. Listings (about 150,000 across Canada) are in /listings/sitemap/{n}.xml,
// split to stay under Google's 50,000-URL limit; robots.txt lists every file.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(page => ({ url: `${SITE}${page}`, changeFrequency: page === "/search" ? "hourly" as const : "monthly" as const, priority: page ? 0.7 : 1 }));
}
