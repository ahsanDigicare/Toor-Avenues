"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LazyListingGallery } from "./listing-gallery";
import { CardPhotos } from "./listing-tools";
import { useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import type { Listing } from "../lib/listings";
import { PROPERTY_TYPES } from "../lib/search-options";

const A = "/assets/";

// Leaflet needs the browser, so the map loads on the client only.
const ListingsMap = dynamic(() => import("./listings-map"), { ssr: false, loading: () => <div className="listings-map is-loading"><p className="map-status">Loading map…</p></div> });
const count = new Intl.NumberFormat("en-CA");

// Shown only when the DDF® database has not been synced (e.g. local development).
const sample = { slug: "", ageLabel: "", badge: null, photo: null, photoCount: 0, brokerage: null, listingUrl: null, latitude: null, longitude: null, remarks: null };
const sampleListings: Listing[] = [
  { ...sample, id: "whitehorn", price: 429900, priceLabel: "$429,900", address: "83 Whitworth Way NE", area: "Whitehorn · Calgary, AB", beds: 3, baths: 2, sqft: 872, type: "Duplex", mls: "A2333036", days: 1 },
  { ...sample, id: "bridlewood", price: 724900, priceLabel: "$724,900", address: "101 Bridlewood Street", area: "Bridlewood · Calgary, AB", beds: 3, baths: 3, sqft: 1383, type: "Single family", mls: "CREA DDF®", days: 2 },
  { ...sample, id: "legacy", price: 989900, priceLabel: "$989,900", address: "408 Legacy Circle SE", area: "Legacy · Calgary, AB", beds: 5, baths: 4, sqft: 2500, type: "Detached", mls: "CREA DDF®", days: 3 },
];

export { PROPERTY_TYPES };

type CustomSelectProps = {
  label: string;
  options: string[];
  value?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
};

export function CustomSelect({ label, options: baseOptions, value, defaultValue, name, onChange }: CustomSelectProps) {
  // A value that came from a link (e.g. "$300K–$600K") is listed right after the default option.
  const options = defaultValue && !baseOptions.includes(defaultValue) ? [baseOptions[0], defaultValue, ...baseOptions.slice(1)] : baseOptions;
  const [internalValue, setInternalValue] = useState(defaultValue || options[0]);
  const wrapper = useRef<HTMLDetailsElement>(null);
  const selected = value ?? internalValue;

  function choose(option: string) {
    setInternalValue(option);
    onChange?.(option);
    if (wrapper.current) wrapper.current.open = false;
  }

  function closeOtherMenus(current: HTMLDetailsElement) {
    document.querySelectorAll<HTMLDetailsElement>(".custom-select[open]").forEach(menu => {
      if (menu !== current) menu.removeAttribute("open");
    });
  }

  return <details className="custom-select" name="tooravenues-dropdown" ref={wrapper}>
    {name && <input type="hidden" name={name} value={selected} />}
    <summary className="custom-select-trigger" aria-label={label} onClick={event => closeOtherMenus(event.currentTarget.parentElement as HTMLDetailsElement)}><span className="custom-select-values">{selected}</span><span className="select-chevron"><Image src={`${A}chevron.svg`} alt="" width={12} height={12} /></span></summary>
    <div className="custom-select-menu" role="listbox" aria-label={label}>{options.map(option => <button type="button" role="option" aria-selected={selected === option} key={option} onClick={() => { choose(option); wrapper.current?.querySelector("summary")?.focus(); }}><span className="custom-select-option-content"><span>{option}</span></span></button>)}</div>
  </details>;
}

type ExplorerProps = {
  listings?: Listing[];
  total?: number;
  page?: number;
  pageSize?: number;
  sort?: "newest" | "low" | "high" | "sqft";
  // Current search query string without sort/page, used to build sort and paging links.
  query?: string;
  initialView?: "list" | "map";
  /** "south,west,north,east" when results are limited to a map area. */
  bounds?: string;
};

const SORT_LABELS = { newest: "Newest first", low: "Price: low to high", high: "Price: high to low", sqft: "Largest first" } as const;

function logListingView(listing: Listing) {
  if (!listing.listingUrl) return;
  try {
    const body = new Blob([JSON.stringify({ listingKey: listing.id })], { type: "application/json" });
    navigator.sendBeacon?.("/api/ddf/analytics", body);
  } catch { /* analytics are best-effort */ }
}

function mapPositions(items: Listing[]) {
  const located = items.filter(item => item.latitude !== null && item.longitude !== null);
  if (!located.length) return null;
  const lats = located.map(item => item.latitude!), lngs = located.map(item => item.longitude!);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // Pins are about 8% of the map wide and 9% tall; nudge any pin that would cover another
  // outwards in a spiral so every price stays clickable.
  const placed: { x: number; y: number }[] = [];
  const overlaps = (x: number, y: number) => placed.some(p => Math.abs(p.x - x) < 8.5 && Math.abs(p.y - y) < 9.5);
  const positions = new Map<string, { left: string; top: string }>();
  for (const item of located) {
    const baseX = 4 + (maxLng === minLng ? 0.5 : (item.longitude! - minLng) / (maxLng - minLng)) * 84;
    const baseY = 6 + (maxLat === minLat ? 0.5 : (maxLat - item.latitude!) / (maxLat - minLat)) * 76;
    let x = baseX, y = baseY;
    for (let step = 1; overlaps(x, y) && step < 80; step++) {
      const angle = step * 0.9, radius = 3 + step * 1.2;
      x = Math.min(90, Math.max(2, baseX + Math.cos(angle) * radius));
      y = Math.min(86, Math.max(4, baseY + Math.sin(angle) * radius));
    }
    placed.push({ x, y });
    positions.set(item.id, { left: `${x}%`, top: `${y}%` });
  }
  return positions;
}

export function PropertyExplorer({ listings: liveListings, total, page = 1, pageSize = 24, sort: serverSort, query = "", initialView = "list", bounds }: ExplorerProps = {}) {
  const live = liveListings !== undefined;
  const listings = liveListings ?? sampleListings;
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">(initialView);
  // Follow ?view=map when the visitor uses a "Map view" link on the same page.
  const [lastInitialView, setLastInitialView] = useState(initialView);
  if (initialView !== lastInitialView) { setLastInitialView(initialView); setView(initialView); }
  const [sort, setSort] = useState("featured");
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const pages = live ? Math.max(1, Math.ceil((total ?? 0) / pageSize)) : 1;
  const pageHref = (target: number, targetSort = serverSort) => {
    const params = new URLSearchParams(query);
    if (targetSort && targetSort !== "newest") params.set("sort", targetSort);
    if (target > 1) params.set("page", String(target));
    if (view === "map") params.set("view", "map");
    const search = params.toString();
    return `/search${search ? `?${search}` : ""}#listing-results`;
  };

  function openListing(listing: Listing) {
    setSelected(listing);
    if (live) logListingView(listing);
  }

  // Esc closes the details pop-up.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem("toor-saved-homes");
      if (stored) setSaved(JSON.parse(stored) as string[]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Live results arrive sorted and paged by the server; only the samples are sorted here.
  const sorted = useMemo(() => live ? listings : [...listings].sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : a.days - b.days), [live, listings, sort]);
  const positions = useMemo(() => mapPositions(sorted), [sorted]);
  const sortLabel = live ? SORT_LABELS[serverSort ?? "newest"] : sort === "featured" ? "Newest first" : sort === "low" ? "Price: low to high" : "Price: high to low";

  function changeSort(option: string) {
    const next = option === "Price: low to high" ? "low" : option === "Price: high to low" ? "high" : option === "Largest first" ? "sqft" : "newest";
    if (live) router.push(pageHref(1, next), { scroll: false });
    else setSort(next === "newest" || next === "sqft" ? "featured" : next);
  }

  function toggleSaved(id: string) {
    setSaved(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      window.localStorage.setItem("toor-saved-homes", JSON.stringify(next));
      return next;
    });
  }

  const renderCard = (item: Listing, i: number) => <article className={`property${hovered === item.id ? " is-hot" : ""}`} key={item.id} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(current => current === item.id ? null : current)}>
      <ViewTransition name={`photo-${item.id}`} share="morph" default="none">
      <div className={item.photo ? "property-img" : `property-img crop-${i % 3}`}>{item.photo ? <CardPhotos listingKey={item.id} photo={item.photo} count={item.photoCount} alt={`Photo of ${item.address}`} sizes="(max-width: 760px) 100vw, 282px" /> : <Image src={`${A}property.png`} alt="Modern Calgary property" fill sizes="(max-width: 760px) 100vw, 282px" />}<button className={saved.includes(item.id) ? "saved" : ""} aria-label={saved.includes(item.id) ? "Remove saved listing" : "Save listing"} onClick={() => toggleSaved(item.id)}><Image src={`${A}heart.svg`} alt="" width={18} height={18} /></button>{live ? item.badge && <small>{item.badge.toUpperCase()}</small> : <small>{item.days === 1 ? "NEW LISTING" : "ILLUSTRATIVE PHOTO"}</small>}</div>
      </ViewTransition>
      <h3>{item.priceLabel}</h3><h4>{live && item.slug ? <Link href={`/listing/${item.slug}`}>{item.address}</Link> : item.address}</h4><p>{item.area} · {item.mls === "CREA DDF®" ? item.mls : `MLS® ${item.mls}`}</p>{item.brokerage && <p>Listed by {item.brokerage}</p>}<hr /><div className="features"><span>⌂ {item.beds ?? "–"} Beds</span><span>◌ {item.baths ?? "–"} Baths</span><span>{item.sqft ? `${count.format(item.sqft)} ft²` : "– ft²"}</span></div><button className="listing-detail-link" onClick={() => openListing(item)}>View details →</button>
    </article>;

  return <div id="listing-results">
    <div className="results-toolbar"><div><strong>{live ? `${count.format(total ?? listings.length)} ${total === 1 ? "home" : "homes"} for sale` : `${listings.length} featured homes`}</strong><span>{saved.length} saved</span></div><div className="view-switch"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map</button><CustomSelect label="Sort listings" value={sortLabel} options={live ? ["Newest first", "Price: low to high", "Price: high to low", "Largest first"] : ["Newest first", "Price: low to high", "Price: high to low"]} onChange={changeSort} /></div></div>
    {view === "map" ? (live
      ? <div className="map-split">
          <div className="listing-grid map-split-list">{sorted.map(renderCard)}</div>
          <div className="map-split-map"><ListingsMap query={new URLSearchParams([...new URLSearchParams(query)].filter(([key]) => key !== "bounds")).toString()} bounds={bounds} hoveredId={hovered} /></div>
        </div>
      : <div className="property-map" role="img" aria-label={live ? "Approximate locations of the listings on this page" : "Sample Calgary property map"}><div className="map-road road-one" /><div className="map-road road-two" />{sorted.filter(listing => !live || positions?.has(listing.id)).map((listing, index) => <button key={listing.id} style={positions?.get(listing.id) ??{ left:`${20 + (index % 3) * 28}%`, top:`${25 + (index % 2) * 38}%` }} onClick={() => openListing(listing)}>${Math.round(listing.price / 1000)}K</button>)}<p>{live ? "Approximate positions for the homes on this page · Select a price to view details" : "Interactive preview · Connect a maps provider and IDX feed for live results"}</p></div>)
      : <div className="listing-grid">{sorted.map(renderCard)}</div>}
    {live && !listings.length && <p className="results-empty">No homes match these filters yet. Try widening the price range or removing a filter.</p>}
    {live && pages > 1 && <nav className="results-pagination" aria-label="Search results pages">{page > 1 ? <a href={pageHref(page - 1)}>← Previous</a> : <span />}<span>Page {page} of {count.format(pages)}</span>{page < pages ? <a href={pageHref(page + 1)}>Next →</a> : <span />}</nav>}
    {selected && <div className="listing-modal" role="dialog" aria-modal="true" aria-label="Property details" onMouseDown={() => setSelected(null)}><article onMouseDown={event => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>{live ? <LazyListingGallery key={selected.id} listingKey={selected.id} fallback={selected.photo} alt={selected.address} /> : <div className="modal-image"><Image src={`${A}property.png`} alt="Illustrative Calgary home interior" fill sizes="600px" /></div>}<small>{selected.type} · {selected.mls === "CREA DDF®" ? selected.mls : `MLS® ${selected.mls}`}</small><h2>{selected.address}</h2><h3>{selected.priceLabel}</h3><p>{selected.beds ?? "–"} beds · {selected.baths ?? "–"} baths{selected.sqft ? ` · ${count.format(selected.sqft)} ft²` : ""} · Active listing</p>{live ? <>{selected.remarks && <p>{selected.remarks}</p>}{selected.brokerage && <p>Listing courtesy of {selected.brokerage}.</p>}<p className="modal-links"><Link href={`/listing/${selected.slug}`}>View full listing{selected.photoCount > 1 ? ` and all ${selected.photoCount} photos` : ""} →</Link>{selected.listingUrl && <a href={selected.listingUrl} target="_blank" rel="noopener">View on REALTOR.ca →</a>}</p></> : <p>This property information comes from the ToorAvenues listing feed. The photograph is illustrative; confirm current availability, property details, listing imagery, and brokerage attribution before publication.</p>}<a className="button green" href="/contact">Request a private showing</a></article></div>}
  </div>;
}

export function BuyerSellerTools() {
  const [price, setPrice] = useState(700000);
  const [down, setDown] = useState(140000);
  const [rate, setRate] = useState(4.75);
  const [submitted, setSubmitted] = useState<"valuation" | "consultation" | null>(null);
  const principal = Math.max(0, price - down);
  const monthlyRate = rate / 100 / 12;
  const payments = 25 * 12;
  const payment = monthlyRate ? principal * monthlyRate * Math.pow(1 + monthlyRate, payments) / (Math.pow(1 + monthlyRate, payments) - 1) : principal / payments;

  return <section className="smart-tools section" id="tools"><div className="shell"><div className="tools-heading"><div><span>BUY &amp; SELL TOOLS</span><h2>Plan your next move with confidence.</h2></div><p>Quick estimates to help you prepare. A ToorAvenues advisor can walk you through the details.</p></div><div className="tools-grid">
    <form className="tool-card" onSubmit={event => event.preventDefault()}><b>MORTGAGE CALCULATOR</b><h3>Estimate your monthly payment</h3><label>Home price<input type="number" value={price} onChange={event => setPrice(Number(event.target.value))} /></label><label>Down payment<input type="number" value={down} onChange={event => setDown(Number(event.target.value))} /></label><label>Interest rate (%)<input type="number" step="0.05" value={rate} onChange={event => setRate(Number(event.target.value))} /></label><div className="payment-result"><span>Estimated payment</span><strong>${Math.round(payment).toLocaleString()}<small>/month</small></strong></div><small>Estimate only; taxes, fees, insurance, and qualification are not included.</small></form>
    <form className="tool-card valuation-card" onSubmit={event => { event.preventDefault(); setSubmitted("valuation"); }}><b>HOME VALUE</b><h3>What could your home sell for?</h3><p>Tell us where your property is located and we&apos;ll prepare a complimentary market evaluation.</p><label>Property address<input required placeholder="Street address, Calgary" /></label><label>Email address<input required type="email" placeholder="you@example.com" /></label><button className="button green" type="submit">Request my home value</button>{submitted === "valuation" && <p className="success-message" role="status">Thank you—we&apos;ll contact you to prepare your evaluation.</p>}</form>
    <div className="tool-card review-card"><b>LOCAL EXPERIENCE</b><h3>Strategic guidance from a proven Calgary team.</h3><div className="stars">TOOR</div><blockquote>Davinder Toor has worked in Calgary real estate since 2012, bringing market knowledge, analytical thinking, and a results-driven approach to every client relationship.</blockquote><p>Founder &amp; REALTOR® · ToorAvenues</p><button className="text-button" onClick={() => setSubmitted("consultation")}>Book a consultation →</button>{submitted === "consultation" && <p className="success-message">Call 403-926-4000 or use the contact details below.</p>}</div>
  </div><div className="faq"><h2>Frequently asked questions</h2>{[["How do I know how much I can afford?","Start with a mortgage pre-approval to understand your budget, strengthen your offer, and make your home search more focused."],["Do I need a real estate agent?","A ToorAvenues REALTOR® can provide local market insight, arrange guided tours, prepare a comparative market analysis, and negotiate price and terms on your behalf."],["Can I save properties?","Yes. Use the heart button on any listing. Saved homes remain available in this browser."],["How do I request a showing?","Open a property, select Request a private showing, or call the ToorAvenues team at 403-926-4000 or 403-926-1122."]].map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>;
}

export function MobileContactBar() {
  return <div className="mobile-contact-bar"><a href="tel:4039264000">Call</a><a href="mailto:info@tooravenues.com">Email</a><a href="#contact">Consultation</a></div>;
}

