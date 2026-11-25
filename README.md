This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Toor-Avenues

## DDF property photo export

The project includes a server-side exporter for the REALTOR.ca DDF feed. Put the destination credentials in the project-root `.env.local` as `DDF_CLIENT_ID` and `DDF_CLIENT_SECRET`. Never prefix these variables with `NEXT_PUBLIC_` or commit them. The exporter requires Node.js 20.6 or later.

```powershell
# Test the connection and export three properties.
npm run ddf:photos -- --limit=3

# Export all properties available to the destination feed.
npm run ddf:photos
```

Each run writes a timestamped NDJSON file under `.data/`, with one listing key and its ordered photo URLs per line. It does not download image files. Full exports use the DDF property replication endpoint to retrieve keys, then fetch property media in batches. A `.partial` file indicates a run did not finish. Both `.data/` and `.env.local` are ignored by Git.

The photo export is a one-off diagnostic. The website does not use it; it uses the synced database described below.

## Live DDF listings

The destination feed is a **National Shared Pool** feed (destination ID 68103). The site shows every residential home for sale on it, across Canada (about 153,000 listings: Ontario, BC, Alberta, Saskatchewan and the Atlantic provinces; Quebec and Manitoba are not on this feed). Listings are stored in a SQLite database: [Turso](https://turso.tech) (hosted SQLite) in production when `TURSO_DATABASE_URL` is set, otherwise a local file read with Node's built-in `node:sqlite`. Both use the same SQL (`src/lib/db.ts` for the site, `scripts/db.mjs` for the scripts). Node.js 24 is required.

```powershell
npm run ddf:sync                  # incremental (a full check when one is due)
npm run ddf:sync -- --master      # force a full check (removals) now
npm run ddf:sync -- --full        # full check and re-fetch every listing
npm run ddf:sync -- --local       # update .data/ddf.sqlite even when Turso is configured
```

There are two kinds of run:
1. **Full check** (the first run, then at least once a day, as CREA requires): builds the master list (listing keys and timestamps) province by province in parallel, with key-based paging that avoids the 10,000-listing `$skip` limit (about 5 minutes nationally). It fetches every new or changed listing, 50 per request with 6 in parallel, and deletes listings that left the feed (sold, expired, withdrawn or no longer approved). The first national load takes about 30–45 minutes.
2. **Changes only** (every run in between): asks DDF for listings modified since the previous run (a few thousand every 3 hours) and updates just those, in a minute or two.

Every run also refreshes brokerages (`Office`) and upcoming open houses (only the differences are written). It then recomputes the **market summary**: totals, typical prices, the price distribution, provinces, cities and home-type counts, stored as one JSON row in `sync_state` (`scripts/market.mjs`). The homepage, Buy, Sell and search pages read that one row instead of scanning every listing. To recompute it on its own, run `node --env-file-if-exists=.env.local scripts/market.mjs [--local]`.

What is stored per listing is kept small for a national database (about 6.5 KB each, about 1 GB in total). Only the record fields the site uses go in `raw`, and the photo URLs are one JSON array per listing (`photos`, plus the cover `photo`), not a row per photo. Older databases are migrated automatically on the next sync.

If a full check's master list looks incomplete, nothing is deleted. A run that would remove more than 30% of stored listings stops unless you pass `--allow-large-removal`.

Settings in `.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DDF_CLIENT_ID`, `DDF_CLIENT_SECRET` | none | Feed credentials. Server-side only; never prefix them with `NEXT_PUBLIC_`. |
| `DDF_CITIES` | none (all of Canada) | Optional: limit the site to these cities (comma-separated), e.g. `Calgary,Airdrie,Cochrane`. |
| `DDF_PROVINCE` | `Alberta` | Province of `DDF_CITIES` (keeps out same-named cities elsewhere, such as Cochrane, ON). |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | none | Use Turso instead of the local file (both the sync and the website). |
| `DDF_DB` | none | Set to `turso` to make `npm run dev` use Turso; otherwise development uses the local file when it exists. |
| `DDF_DB_PATH` | `.data/ddf.sqlite` | Local database location. |
| `DDF_DESTINATION_ID` | none | Turns on CREA analytics "View" events (`/api/ddf/analytics`). |

**Hosting on Vercel.** Vercel's filesystem is read-only and the database is too large for Git, so production uses Turso:

1. Create a Turso database (pick the region closest to your Vercel functions, e.g. AWS us-east-1) and an auth token with read and write access.
2. Load the listings into Turso, either way:
   - **Recommended for the national first load:** add the GitHub secrets (step 4), then run the **DDF listing sync** workflow from the Actions tab. It syncs straight into Turso from GitHub's fast network.
   - Or run `npm run db:upload` to copy your local `.data/ddf.sqlite` (about 1 GB nationally; resumable, retries dropped connections).
3. In Vercel → Project → Settings → Environment Variables, add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `SITE_URL`, then redeploy. The DDF credentials are not needed on Vercel.
4. In GitHub → Settings → Secrets and variables → Actions, add `DDF_CLIENT_ID`, `DDF_CLIENT_SECRET`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The workflow `.github/workflows/ddf-sync.yml` then syncs every 3 hours and can be run by hand from the Actions tab.

**Plan sizing.** Turso bills row reads, row writes and storage. Syncing is cheap (a few thousand changed rows per run). Page views read the stored market summary, but every search still counts its matching homes, and a search across all of Canada reads up to about 150,000 rows. For a public national site, budget for Turso's entry paid plan, and check the Usage page in the Turso dashboard after launch.

**Scheduling elsewhere.** On a server with a persistent disk (a VPS, or similar), the local file works without Turso: schedule `npm run ddf:sync` with cron (`17 */3 * * * cd /path/to/site && npm run ddf:sync`) or Windows Task Scheduler.

**Sitemaps.** `/sitemap.xml` lists the site's pages. Listings are split across `/listings/sitemap/{n}.xml` files (40,000 each, under Google's 50,000-URL limit), and `robots.txt` lists every file.

The website behaviour:
- When no database exists, the homepage and `/search` fall back to the illustrative sample cards.
- Only listings with a price, a residential type (Single Family or Multi-family) and `InternetEntireListingDisplayYN` set to true are shown.
- When `InternetAddressDisplayYN` is false, the address and map position are hidden.
- Photos load from `ddfcdn.realtor.ca` through `next/image`, configured in `next.config.ts`.

### URLs carried over from the previous site

Listing pages use the previous WordPress site's URL scheme, `/listing/{address}-{city}-{mls}` (for example `/listing/14-radcliffe-crescent-se-calgary-a2359747`), so indexed pages and shared links keep working. Pages are looked up by the MLS® number at the end of the URL. A URL with an outdated address part redirects to the current one, and a sold or expired listing shows a "no longer on the market" page marked `noindex`.

`next.config.ts` redirects `/real-estate-listing/` → `/search` (keeping the query string; old parameters such as `keyword`, `property_type`, `min_price`, `zone` and `status=open-house` are understood), `/buy-a-house-calgary/` → `/buy`, `/sell-my-house-calgary/` → `/sell`, and the old Yoast sitemaps → `/sitemap.xml`. The sitemap lists every page and every current listing and refreshes hourly. After launch, submit `https://tooravenues.com/sitemap.xml` in Google Search Console. Set `SITE_URL` if the site runs on a different domain.

### Before publishing (confirm with the client)

The DDF Web API documentation covers syncing and analytics but not display rules. Those come from the client's DDF agreement, CREA's DDF policy and the CREA trademark rules. Check the following before launch:

- [ ] The wording in `src/app/ddf-notice.tsx` (trademark notice, disclaimer, "Powered by REALTOR.ca") matches what CREA and the board currently require, including whether the REALTOR.ca logo is required.
- [ ] Brokerage attribution is placed and sized as required. Cards and the detail view currently show "Listed by {brokerage}". Confirm whether the listing agent's name is also required.
- [ ] Linking to the REALTOR.ca listing page (`ListingURL`) from the detail view is acceptable as implemented.
- [ ] Resizing and caching photos through `next/image` is allowed. If not, add `unoptimized` to the listing `<Image>` elements so photos are served directly from the CREA CDN.
- [ ] Whether CREA analytics events are expected. They are enabled with `DDF_DESTINATION_ID`. The privacy policy should mention the analytics cookie and CREA analytics.
- [ ] The GitHub Actions sync is running (Actions tab shows green runs), and the client accepts the removal timing (sold listings leave at the daily full check, plus up to 1 hour of page caching).
- [ ] Showing listings from other provinces is allowed under the client's DDF agreement and their brokerages' advertising rules (REALTORS® are licensed by province; the Buy page tells out-of-province buyers they will be connected with a REALTOR® licensed where they buy).
- [ ] The "Open houses only" filter is disabled because `OpenHouse` data is not synced yet.
