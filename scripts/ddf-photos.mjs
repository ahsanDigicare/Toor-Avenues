import { createWriteStream } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import path from "node:path";

const apiBase = new URL("https://ddfapi.realtor.ca/odata/v1/");
const clientId = process.env.DDF_CLIENT_ID;
const clientSecret = process.env.DDF_CLIENT_SECRET;
const limitArgument = process.argv.slice(2).find((argument) => argument.startsWith("--limit="));
const limit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : null;

if (!clientId || !clientSecret) throw new Error("DDF_CLIENT_ID and DDF_CLIENT_SECRET are required in .env.local.");
if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
  throw new Error("For a sample, use --limit=N with a number from 1 to 100.");
}

let token;
let tokenExpiresAt = 0;

async function getToken(force = false) {
  if (!force && token && Date.now() < tokenExpiresAt) return token;
  const response = await fetch("https://identity.crea.ca/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: "DDFApi_Read" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`DDF authentication failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (!result.access_token) throw new Error("DDF did not return an access token.");
  token = result.access_token;
  tokenExpiresAt = Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000;
  return token;
}

async function getPage(address) {
  const url = new URL(address, apiBase);
  if (url.origin !== apiBase.origin || !url.pathname.startsWith(apiBase.pathname)) {
    throw new Error("DDF returned an unexpected pagination URL.");
  }
  const request = async (accessToken) => fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(60_000),
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await request(await getToken());
      if (response.status === 401) response = await request(await getToken(true));
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (response.ok) {
      const result = await response.json();
      if (!Array.isArray(result.value)) throw new Error("DDF returned an unexpected response.");
      return result;
    }
    if ((response.status !== 429 && response.status < 500) || attempt === 4) {
      throw new Error(`DDF property request failed (HTTP ${response.status}).`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function* pages(firstUrl) {
  let next = firstUrl;
  while (next) {
    const page = await getPage(next);
    yield page.value;
    next = page["@odata.nextLink"] || null;
  }
}

function propertyUrl(params) {
  const url = new URL("Property", apiBase);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

async function* properties() {
  if (limit !== null) {
    const url = propertyUrl({ "$select": "ListingKey,ModificationTimestamp,Media", "$top": String(limit), "$orderby": "ListingKey" });
    const page = await getPage(url);
    yield* page.value.slice(0, limit);
    return;
  }

  // The replication endpoint provides the complete feed's keys, including feeds
  // larger than the standard Property endpoint's 10,000-record pagination limit.
  const masterUrl = new URL("Property/PropertyReplication()", apiBase);
  for await (const records of pages(masterUrl)) {
    for (let offset = 0; offset < records.length; offset += 250) {
      const requests = [];
      for (let batchOffset = offset; batchOffset < Math.min(offset + 250, records.length); batchOffset += 50) {
        const keys = records.slice(batchOffset, batchOffset + 50).map((record) => record.ListingKey).filter(Boolean);
        if (!keys.length) continue;
        const quotedKeys = keys.map((key) => `'${String(key).replaceAll("'", "''")}'`).join(",");
        const url = propertyUrl({ "$select": "ListingKey,ModificationTimestamp,Media", "$filter": `ListingKey in (${quotedKeys})`, "$top": "100", "$orderby": "ListingKey" });
        requests.push((async () => {
          const batch = [];
          for await (const page of pages(url)) batch.push(...page);
          return batch;
        })());
      }
      for (const batch of await Promise.all(requests)) yield* batch;
    }
  }
}

async function main() {
  await mkdir(".data", { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const output = path.join(".data", `ddf-photos-${stamp}.ndjson`);
  const temporary = `${output}.partial`;
  const stream = createWriteStream(temporary, { flags: "wx" });
  let listingCount = 0;
  let photoCount = 0;

  try {
    for await (const property of properties()) {
      const photos = (Array.isArray(property.Media) ? property.Media : [])
        .filter((media) => ["property photo", "photo"].includes(String(media.MediaCategory || "").toLowerCase()) && typeof media.MediaURL === "string" && media.MediaURL.startsWith("https://"))
        .sort((a, b) => (a.Order ?? Number.MAX_SAFE_INTEGER) - (b.Order ?? Number.MAX_SAFE_INTEGER))
        .map((media) => ({ url: media.MediaURL, order: media.Order ?? null, preferred: media.PreferredPhotoYN === true, modifiedAt: media.ModificationTimestamp ?? null }));
      const record = { listingKey: property.ListingKey, modifiedAt: property.ModificationTimestamp ?? null, photos };
      if (!stream.write(`${JSON.stringify(record)}\n`)) await once(stream, "drain");
      listingCount++;
      photoCount += photos.length;
      if (listingCount % 1000 === 0) console.log(`Processed ${listingCount} properties.`);
    }
    stream.end();
    await finished(stream);
    await rename(temporary, output);
    console.log(`Saved ${listingCount} properties and ${photoCount} photo URLs to ${output}.`);
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

main().catch((error) => {
  console.error(`DDF export failed: ${error.message}`);
  process.exitCode = 1;
});
