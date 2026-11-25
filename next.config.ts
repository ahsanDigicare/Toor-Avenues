import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Let the dev server be opened from other devices / this PC's network address
  // (e.g. http://192.168.100.214:3000). Without this, Next.js blocks the dev scripts
  // for that address and no button on the page works. Development only.
  allowedDevOrigins: ["192.168.100.214", "192.168.*.*", "10.*.*.*", "*.local"],
  partialPrefetching: true,
  images: {
    // REALTOR.ca DDF® listing photos (verified: every Media URL in the feed uses this host and path).
    remotePatterns: [{ protocol: "https", hostname: "ddfcdn.realtor.ca", port: "", pathname: "/listing/**", search: "" }],
  },
  // Keep the previous WordPress site's URLs working (indexed pages, bookmarks, shared links).
  // Query strings pass through, and /search understands the old parameter names.
  async redirects() {
    return [
      { source: "/real-estate-listing", destination: "/search", permanent: true },
      { source: "/sell-my-house-calgary", destination: "/sell", permanent: true },
      { source: "/buy-a-house-calgary", destination: "/buy", permanent: true },
      { source: "/sitemap_index.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/page-sitemap.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/listing-sitemap:n(\\d+).xml", destination: "/sitemap.xml", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
