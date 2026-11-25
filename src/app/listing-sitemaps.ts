import "server-only";

import { getMarket } from "../lib/listings";

export const LISTINGS_PER_SITEMAP = 40_000;

/**
 * Number of listing sitemap files, with room for growth between deploys (the file list
 * is fixed at build time; a file past the end is simply empty).
 */
export async function listingSitemapCount() {
  const total = (await getMarket())?.total ?? 0;
  return Math.max(1, Math.ceil(total * 1.25 / LISTINGS_PER_SITEMAP));
}
