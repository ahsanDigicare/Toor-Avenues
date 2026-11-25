// "Smart search": turns a plain-English home search into structured filters.
//   "3 bed house in NW under $700k with a fireplace and a garage"
//   → beds 3 · type Detached · Calgary NW · max 700,000 · fireplace · parking 1
// Anything not understood (usually a community or street name) is returned as `rest`
// and used as the location search.

import type { FilterState } from "./search-options";

export type SmartToken = { kind: "price" | "rooms" | "type" | "area" | "feature" | "status" | "size"; label: string };
export type SmartResult = { patch: Partial<FilterState>; tokens: SmartToken[]; rest: string };

const short = (value: number) => value >= 1_000_000 ? `$${Number((value / 1_000_000).toFixed(2))}M` : `$${Math.round(value / 1000)}K`;

/** "600k" → 600000, "1.2m" → 1200000, "650,000" → 650000, "600" → 600000 (bare hundreds read as thousands). */
function money(amount: string, unit?: string) {
  const value = Number(amount.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return 0;
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("m")) return Math.round(value * 1_000_000);
  if (u.startsWith("k") || u.startsWith("t")) return Math.round(value * 1000);
  return value < 1000 ? Math.round(value * 1000) : Math.round(value);
}

const NUM = String.raw`\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million|thousand)?`;

const TYPES: [RegExp, string, string][] = [
  [/\b(?:acreages?|acres? ?lots?|country residential)\b/, "Acreage", "Acreage"],
  [/\b(?:bungalows?|single[- ]level|one[- ]storey)\b/, "Bungalow", "Bungalow"],
  [/\b(?:semi[- ]?detached|semis?|duplex(?:es)?|half[- ]duplex)\b/, "Semi-detached", "Semi-detached"],
  [/\b(?:town ?homes?|town ?houses?|row ?homes?|row ?houses?)\b/, "Townhouse", "Townhouse"],
  [/\b(?:condos?|condominiums?|apartments?|apts?|lofts?)\b/, "Condo", "Condo"],
  [/\b(?:multi[- ]?family|fourplex|four[- ]plex|triplex|revenue property)\b/, "Multi-family", "Multi-family"],
  [/\b(?:mobile|manufactured)(?: homes?)?\b/, "Mobile", "Mobile"],
  [/\b(?:detached|single[- ]family|houses?)\b/, "Detached", "House"],
];

const FEATURES: [RegExp, string, string][] = [
  [/\b(?:a\/?c|air[- ]?condition(?:ing|ed)?|central air)\b/, "ac", "Air conditioning"],
  [/\bfireplaces?\b/, "fireplace", "Fireplace"],
  [/\bfinished basement\b/, "finished-basement", "Finished basement"],
  [/\b(?:(?:legal|basement|secondary|illegal|in-?law) suites?|suited|suite|separate entrance|mortgage helper)\b/, "suite", "Basement suite"],
  [/\b(?:water ?front|lake ?front|river ?front|on the (?:lake|river)|lakeside)\b/, "waterfront", "Waterfront"],
  [/\b(?:(?:mountain|city|river|lake) )?views?\b/, "view", "Has a view"],
  [/\b(?:swimming )?pools?\b/, "pool", "Pool"],
];

const QUADRANTS: Record<string, string> = { nw: "NW", ne: "NE", sw: "SW", se: "SE", northwest: "NW", northeast: "NE", southwest: "SW", southeast: "SE" };
const FILLER = /\b(?:a|an|the|in|on|with|and|or|for|sale|homes?|propert(?:y|ies)|listings?|near|by|that|has|have|having|at|of|to|me|find|show|looking|look|want|wanted|need|i|my|budget|price[ds]?|around|about|plus|some|any|good|nice|great|big|small|cheap|affordable|lots?|space|area|neighbou?rhood|community|calgary's|place|it|is|are|be|ideally|preferably|please|less|more|than|max|min)\b/g;

export function parseSmartSearch(input: string): SmartResult {
  const patch: Partial<FilterState> = {};
  const tokens: SmartToken[] = [];
  const features: string[] = [];
  let text = ` ${input.toLowerCase().replace(/[“”"!?;]/g, " ").replace(/\s+/g, " ")} `;
  const take = (pattern: RegExp, handle: (match: RegExpExecArray) => void) => {
    const match = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
    if (!match) return false;
    handle(match);
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
    return true;
  };

  // Status first ("open house" must not read as a house).
  if (take(/\bopen[- ]?hous(?:e|es)\b/, () => {})) { patch.status = "open-house"; tokens.push({ kind: "status", label: "Open houses" }); }
  else if (take(/\b(?:new(?:est)? listings?|just listed|new this week|recently listed|brand new listings?)\b/, () => {})) { patch.status = "new"; tokens.push({ kind: "status", label: "New listings" }); }

  // Rooms and sizes before prices so their numbers aren't read as money.
  take(/\b(\d)\s*\+?\s*(?:or more\s*)?(?:bed(?:room)?s?|bdrms?|bds?|brs?)\b/, m => { patch.beds = m[1]; tokens.push({ kind: "rooms", label: `${m[1]}+ beds` }); });
  take(/\b(\d)(?:\.5)?\s*\+?\s*(?:or more\s*)?(?:bath(?:room)?s?|baths?|ba)\b/, m => { patch.baths = m[1]; tokens.push({ kind: "rooms", label: `${m[1]}+ baths` }); });
  take(/\b(?:over|above|at least|min(?:imum)?|more than)?\s*(\d[\d,]{2,5})\s*\+?\s*(?:sq\.?\s*ft\.?|sqft|square\s*f(?:ee|oo)t|sf)\b/, m => {
    const sqft = m[1].replace(/,/g, ""); patch.sqft = sqft; tokens.push({ kind: "size", label: `${Number(sqft).toLocaleString("en-CA")}+ sq ft` });
  });
  take(/\b(\d+(?:\.\d+)?)\s*\+?\s*acres?\b/, m => { patch.lot = m[1]; tokens.push({ kind: "size", label: `${m[1]}+ acre lot` }); });
  if (!take(/\b(single|double|triple|\d)[- ]?(?:car\s*)?(?:garage|parking|stalls?)\b/, m => {
    const spots = { single: "1", double: "2", triple: "3" }[m[1]] ?? m[1];
    patch.parking = spots; tokens.push({ kind: "feature", label: `${spots}+ parking` });
  })) take(/\b(?:garage|parking)\b/, () => { patch.parking = "1"; tokens.push({ kind: "feature", label: "Garage / parking" }); });
  take(/\b(?:built\s+)?(?:after|since|newer than|in or after)\s+((?:19|20)\d{2})\b/, m => { patch.year = m[1]; tokens.push({ kind: "size", label: `Built ${m[1]}+` }); });
  take(/\b(?:built\s+)?before\s+((?:19|20)\d{2})\b/, m => { patch.maxYear = m[1]; tokens.push({ kind: "size", label: `Built before ${m[1]}` }); });
  take(/\bnew (?:build|construction|built)\b/, () => { patch.year = String(new Date().getFullYear() - 1); tokens.push({ kind: "size", label: "New build" }); });
  take(new RegExp(String.raw`\b(?:condo )?fees? (?:under|below|max|less than|up to)\s*${NUM}`), m => {
    patch.fee = String(Math.round(Number(m[1].replace(/,/g, "")))); tokens.push({ kind: "price", label: `Fees under $${patch.fee}/mo` });
  });

  // Prices: ranges, then ceilings, floors and a bare budget ("$650k").
  const range = take(new RegExp(String.raw`\b(?:between\s+)?${NUM}\s*(?:-|–|to|and)\s*${NUM}`), m => {
    if (!m[2] && !m[4] && !/\$/.test(m[0])) return;
    const low = money(m[1], m[2] ?? m[4]), high = money(m[3], m[4]);
    if (low && high) { patch.min = String(Math.min(low, high)); patch.max = String(Math.max(low, high)); tokens.push({ kind: "price", label: `${short(Math.min(low, high))}–${short(Math.max(low, high))}` }); }
  });
  if (!range || !patch.max) {
    take(new RegExp(String.raw`\b(?:under|below|less than|max(?:imum)?|up to|no more than|cheaper than|<)\s*${NUM}`), m => {
      const value = money(m[1], m[2]); if (value) { patch.max = String(value); tokens.push({ kind: "price", label: `Under ${short(value)}` }); }
    });
    take(new RegExp(String.raw`\b(?:over|above|more than|min(?:imum)?|from|at least|starting at|>)\s*${NUM}`), m => {
      const value = money(m[1], m[2]); if (value) { patch.min = String(value); tokens.push({ kind: "price", label: `${short(value)}+` }); }
    });
    if (!patch.max && !patch.min) take(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million)?|\b(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million)\b/, m => {
      const value = money(m[1] ?? m[3], m[2] ?? m[4]); if (value) { patch.max = String(value); tokens.push({ kind: "price", label: `Up to ${short(value)}` }); }
    });
  }

  // Area: a Calgary quadrant or one of the nearby cities.
  if (!take(/\b(?:calgary\s+)?(nw|ne|sw|se|north ?west|north ?east|south ?west|south ?east)(?:\s+calgary)?\b/, m => {
    const quadrant = QUADRANTS[m[1].replace(/\s/g, "")]; patch.city = `Calgary ${quadrant}`; tokens.push({ kind: "area", label: `Calgary ${quadrant}` });
  })) take(/\b(calgary|airdrie|chestermere|cochrane)\b/, m => {
    const city = m[1][0].toUpperCase() + m[1].slice(1); patch.city = city; tokens.push({ kind: "area", label: city });
  });

  for (const [pattern, value, label] of TYPES) if (!patch.type && take(pattern, () => {})) { patch.type = value; tokens.push({ kind: "type", label }); }
  for (const [pattern, value, label] of FEATURES) if (take(pattern, () => {})) { features.push(value); tokens.push({ kind: "feature", label }); }
  if (features.length) patch.features = features;

  if (!patch.min && take(/\b(?:luxury|luxurious|high[- ]end|estate home)\b/, () => {})) { patch.min = "1000000"; tokens.push({ kind: "price", label: "Luxury · $1M+" }); }
  // Describing words ("family home", "modern", "move-in ready") aren't places.
  while (take(/\b(?:family|families|kids?|dream|forever|starter|first|perfect|ideal|cozy|cosy|modern|updated|renovated|spacious|beautiful|bright|quiet|lovely|charming|stunning|move[- ]in ready|turnkey|investment|investor|retire(?:ment|d)?|couple|single|young)\b/, () => {})) { /* remove every occurrence */ }

  // Words that describe timing or storeys aren't searchable filters; keep them out of the location.
  take(/\b(?:this|next) weekend\b|\b(?:today|tomorrow|asap|soon)\b/, () => {});
  take(/\b(?:\d|one|two|three)[- ]?(?:storey|story|stories|storeys|level)s?\b/, () => {});

  const rest = text.replace(FILLER, " ").replace(/[$+,.\-–/&()]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\p{L}/gu, letter => letter.toUpperCase());
  return { patch, tokens, rest };
}
