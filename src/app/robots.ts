import type { MetadataRoute } from "next";

const SITE = process.env.SITE_URL || "https://tooravenues.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
