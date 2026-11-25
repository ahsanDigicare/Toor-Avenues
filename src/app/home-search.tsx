"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FILTERS } from "../lib/search-options";
import { parseSmartSearch } from "../lib/smart-search";
import { EXAMPLES, QUICK_PICKS, icon, merge, toParams, useRollingNumber } from "./listing-filter";

const count = new Intl.NumberFormat("en-CA");
const SearchIcon = () => icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 20);

/**
 * Homepage search band: the same smart search as /search in a compact form.
 * Type the home you want in plain English (understood live), or tap a quick pick.
 * Both open /search with the matching filters.
 */
export default function HomeSmartSearch({ variant = "band" }: { variant?: "band" | "hero" }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [example, setExample] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const smart = useMemo(() => parseSmartSearch(draft), [draft]);
  const query = useMemo(() => toParams({ ...merge(EMPTY_FILTERS, smart.patch), query: smart.rest }, {}).toString(), [smart]);
  const rolling = useRollingNumber(total);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/listings/count?${query}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then((result: { total?: number | null } | null) => { if (typeof result?.total === "number") setTotal(result.total); })
        .catch(() => { /* keep the last count */ });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (draft || focused) return;
    const timer = window.setInterval(() => setExample(current => (current + 1) % EXAMPLES.length), 3200);
    return () => window.clearInterval(timer);
  }, [draft, focused]);

  const go = (params: string) => router.push(`/search${params ? `?${params}` : ""}#listing-results`);

  const hero = variant === "hero";
  return <form className={hero ? "home-smart hero-smart" : "ed-search home-smart"} action="/search" autoComplete="off" role="search" aria-label="Search Calgary homes" onSubmit={event => { event.preventDefault(); go(query); }}>
    <div className="ed-shell">
      <div className="ed-search-title">
        <h2><span className="sf-spark" aria-hidden="true">✦</span> {hero ? "Smart search — describe your next home" : "Start your Calgary real estate search"}</h2>
        <Link href="/search?view=map#listing-results">Map view →</Link>
      </div>

      <div className="sf-search">
        <label className="sf-input">
          <SearchIcon />
          <span className="sf-field">
            <input value={draft} onChange={event => setDraft(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              aria-label="Describe the home you want, or search a community, address or MLS® number" spellCheck={false} />
            {!draft && <span className="sf-example" key={example} aria-hidden="true">{focused ? "Try: " : ""}{EXAMPLES[example]}</span>}
          </span>
          {draft && <button type="button" className="sf-clear" aria-label="Clear search" onClick={() => setDraft("")}>×</button>}
        </label>
        <button type="submit" className="sf-go">
          <span className="sf-go-count">{rolling === null ? "Search" : count.format(rolling)}</span>
          <span className="sf-go-label">{rolling === null ? "homes" : `${rolling === 1 ? "home" : "homes"} · show me`}</span>
          <i aria-hidden="true">→</i>
        </button>
      </div>

      <div className="sf-understood" aria-live="polite">
        {smart.tokens.length || smart.rest ? <>
          <span>Understood:</span>
          {smart.rest && <em className="sf-token area">📍 {smart.rest}</em>}
          {smart.tokens.map(token => <em className={`sf-token ${token.kind}`} key={token.label}>{token.label}</em>)}
        </> : <span>Search the way you’d say it — beds, budget, area and must-haves — or start with a quick pick.</span>}
      </div>

      <div className="sf-picks" role="group" aria-label="Quick picks">
        {QUICK_PICKS.map(pick => <button type="button" key={pick.title} onClick={() => go(toParams(merge(EMPTY_FILTERS, pick.patch), {}).toString())}>
          <i>{icon(pick.icon, 20)}</i><span><b>{pick.title}</b><small>{pick.copy}</small></span>
        </button>)}
      </div>

      <div className="ed-search-foot"><Link href="/search?more=1#listing-results">+ All filters</Link><Link href="#updates">Save your search &amp; get listing updates →</Link></div>
    </div>
  </form>;
}
