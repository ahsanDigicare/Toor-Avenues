"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { parseSmartSearch } from "../lib/smart-search";
import {
  BATH_OPTIONS, BED_OPTIONS, CITY_OPTIONS, DAY_STEPS, FEATURE_CHOICES, FEE_STEPS, LOT_STEPS, PARKING_OPTIONS,
  PRICE_PRESETS, PRICE_STEPS, SQFT_STEPS, STATUS_CHOICES, TYPE_CHOICES, YEAR_STEPS, priceRangeLabel, EMPTY_FILTERS, type FilterState,
} from "../lib/search-options";

// ---------------------------------------------------------------------------
// Smart search: describe the home in plain English (parsed live into filters),
// one-tap quick picks, refine pills that open detailed panels, and a live,
// rolling count of matching homes.
// ---------------------------------------------------------------------------

export type { FilterState };
export { EMPTY_FILTERS };

export type Panel = "status" | "price" | "rooms" | "type" | "more";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-CA");
const short = (value: number) => value >= 1_000_000 ? `$${Number((value / 1_000_000).toFixed(2))}M` : `$${Math.round(value / 1000)}K`;

/** The filter state as URL parameters (empty values left out). */
export function toParams(state: FilterState, hidden: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    const text = Array.isArray(value) ? value.join(",") : value;
    if (text) params.set(key, text);
  }
  for (const [key, value] of Object.entries(hidden)) if (value && !params.has(key)) params.set(key, value);
  return params;
}

// --- Icons -------------------------------------------------------------------

export const icon = (path: React.ReactNode, size = 18) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
const SearchIcon = () => icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
const SlidersIcon = () => icon(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
const Chevron = () => <svg className="lf-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const TYPE_ICONS: Record<string, React.ReactNode> = {
  house: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  semi: <><path d="M2 11 7 6l5 5 5-5 5 5" /><path d="M4 10v10h16V10" /><path d="M12 11v9" /></>,
  town: <><path d="M3 20V9l4-4 4 4 4-4 4 4v11" /><path d="M3 20h18M11 9v11M15 9v11M7 12v2M19 12v2" /></>,
  condo: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  bungalow: <><path d="M2 12 12 6l10 6" /><path d="M4 11v9h16v-9" /><path d="M8 14h3v3H8zM14 14h3v6" /></>,
  multi: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18M7 7h2M15 7h2M7 12h2M15 12h2M7 17h2M15 17h2" /></>,
  mobile: <><rect x="2" y="8" width="20" height="9" rx="2" /><path d="M6 17v2M18 17v2M6 11h4M14 11h4" /></>,
  land: <><path d="M12 21v-6" /><circle cx="12" cy="9" r="5" /><path d="M4 21h16" /></>,
};

// --- Building blocks -----------------------------------------------------------

function PanelFooter({ onReset, onApply, applyLabel = "Apply" }: { onReset: () => void; onApply: () => void; applyLabel?: string }) {
  return <div className="lf-panel-foot">
    <button type="button" className="lf-reset" onClick={onReset}>Reset</button>
    <button type="button" className="lf-apply" onClick={onApply}>{applyLabel}</button>
  </div>;
}

function Pills({ label, hint, options, value, onChange }: { label: string; hint?: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const current = value ? `${value}+` : "Any";
  return <div className="lf-pills">
    <p><b>{label}</b>{hint && <span>{hint}</span>}</p>
    <div role="radiogroup" aria-label={label}>
      {options.map(option => <button type="button" role="radio" aria-checked={current === option} key={option}
        onClick={() => onChange(option === "Any" ? "" : option.replace("+", ""))}>{option}</button>)}
    </div>
  </div>;
}

function RangeSelect({ label, options, min, max, onMin, onMax, format }: {
  label: string; options: number[]; min: string; max: string; onMin: (value: string) => void; onMax: (value: string) => void; format: (value: number) => string;
}) {
  return <div className="lf-field">
    <span>{label}</span>
    <div className="lf-range-pair">
      <select aria-label={`${label} minimum`} value={min} onChange={event => onMin(event.target.value)}>
        <option value="">No min</option>
        {options.filter(option => !max || option <= Number(max)).map(option => <option key={option} value={option}>{format(option)}</option>)}
      </select>
      <i aria-hidden="true">–</i>
      <select aria-label={`${label} maximum`} value={max} onChange={event => onMax(event.target.value)}>
        <option value="">No max</option>
        {options.filter(option => !min || option >= Number(min)).map(option => <option key={option} value={option}>{format(option)}</option>)}
      </select>
    </div>
  </div>;
}

/** Price histogram with a two-handle slider, preset chips and exact min / max inputs. */
function PricePicker({ state, set, bins }: { state: FilterState; set: (patch: Partial<FilterState>) => void; bins: number[] }) {
  const last = PRICE_STEPS.length - 1;
  const toIndex = (value: string, fallback: number) => {
    if (!value) return fallback;
    const amount = Number(value);
    const index = PRICE_STEPS.findIndex(step => step >= amount);
    return index < 0 ? last : index;
  };
  const low = toIndex(state.min, 0);
  const high = toIndex(state.max, last);
  const total = bins.reduce((sum, value) => sum + value, 0);
  const inRange = bins.slice(low, high).reduce((sum, value) => sum + value, 0) + (high === last ? bins[last] ?? 0 : 0);

  // Typical (median) asking price inside the selected range, from the histogram.
  const typical = useMemo(() => {
    let seen = 0;
    for (let i = low; i <= Math.min(high, last); i++) {
      seen += bins[i] ?? 0;
      if (seen >= inRange / 2) return i === last ? PRICE_STEPS[last] : (PRICE_STEPS[i] + PRICE_STEPS[Math.min(i + 1, last)]) / 2;
    }
    return 0;
  }, [bins, low, high, last, inRange]);

  // Smooth area path for the histogram (square-root scale keeps the long tail visible).
  const peak = Math.max(1, ...bins.map(Math.sqrt));
  const points = bins.map((value, i) => [(i + 0.5) / bins.length * 100, 100 - Math.sqrt(value) / peak * 88] as const);
  const path = points.reduce((d, [x, y], i) => {
    if (!i) return `M0,100 L0,${y} L${x},${y}`;
    const [px, py] = points[i - 1];
    const cx = (px + x) / 2;
    return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "") + ` L100,${points.at(-1)?.[1] ?? 100} L100,100 Z`;
  const from = low / last * 100, to = high / last * 100;

  const setIndex = (which: "min" | "max", index: number) => {
    if (which === "min") set({ min: index <= 0 ? "" : String(PRICE_STEPS[Math.min(index, high - 1)]) });
    else set({ max: index >= last ? "" : String(PRICE_STEPS[Math.max(index, low + 1)]) });
  };
  const activePreset = PRICE_PRESETS.find(preset => String(preset.min || "") === state.min && String(preset.max || "") === state.max);

  return <div className="lf-price">
    <div className="lf-chip-grid">
      {PRICE_PRESETS.map(preset => <button type="button" key={preset.label} aria-pressed={activePreset === preset}
        onClick={() => set(activePreset === preset ? { min: "", max: "" } : { min: preset.min ? String(preset.min) : "", max: preset.max ? String(preset.max) : "" })}>{preset.label}</button>)}
    </div>
    {total > 0 && <div className="lf-histogram" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lf-hist-on" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#188c63" /><stop offset="1" stopColor="#188c63" stopOpacity=".15" /></linearGradient>
          <clipPath id="lf-hist-clip"><rect x={from} width={Math.max(0, to - from)} y="0" height="100" /></clipPath>
        </defs>
        <path d={path} fill="#dfe9e3" />
        <path d={path} fill="url(#lf-hist-on)" clipPath="url(#lf-hist-clip)" />
      </svg>
      <b style={{ left: `${from}%` }}>{state.min ? short(Number(state.min)) : "Any"}</b>
      <b style={{ left: `${to}%` }}>{state.max ? short(Number(state.max)) : "Any"}</b>
    </div>}
    <div className="lf-slider" style={{ "--from-n": from / 100, "--to-n": to / 100 } as React.CSSProperties}>
      <input type="range" min={0} max={last} step={1} value={low} aria-label="Minimum price" aria-valuetext={state.min ? money.format(Number(state.min)) : "No minimum"} onChange={event => setIndex("min", Number(event.target.value))} />
      <input type="range" min={0} max={last} step={1} value={high} aria-label="Maximum price" aria-valuetext={state.max ? money.format(Number(state.max)) : "No maximum"} onChange={event => setIndex("max", Number(event.target.value))} />
    </div>
    <div className="lf-slider-scale"><span>$0</span><span>$10M+</span></div>
    {total > 0 && <p className="lf-insight"><b>{Math.round(inRange / total * 100)}%</b> of current homes fall in this range{typical ? <> · typical asking price <b>{short(typical)}</b></> : null}</p>}
    <div className="lf-money-pair">
      <label><span>$</span><input inputMode="numeric" placeholder="Enter min" aria-label="Minimum price" value={state.min ? count.format(Number(state.min)) : ""} onChange={event => set({ min: event.target.value.replace(/\D/g, "").slice(0, 9) })} /></label>
      <i aria-hidden="true">–</i>
      <label><span>$</span><input inputMode="numeric" placeholder="Enter max" aria-label="Maximum price" value={state.max ? count.format(Number(state.max)) : ""} onChange={event => set({ max: event.target.value.replace(/\D/g, "").slice(0, 9) })} /></label>
    </div>
    <Link className="lf-link" href="/buy#pre-approval">Estimate my monthly payment →</Link>
  </div>;
}

const subscribeNothing = () => () => {};

// --- Main component ------------------------------------------------------------

type Chip = { label: string; remove: Partial<FilterState>; href?: string };

export const EXAMPLES = [
  "3 bed house in NW under $700k with a garage",
  "Condo downtown under $400k",
  "Tuscany bungalow with a finished basement",
  "Family home in Airdrie, 4 beds, $500k–$750k",
  "New listings with a legal suite",
  "Acreage near Cochrane, 2+ acres",
];

/** One-tap starting points. A pick is "on" when every value it sets is currently set. */
export const QUICK_PICKS: { title: string; copy: string; icon: React.ReactNode; patch: Partial<FilterState> }[] = [
  { title: "First home", copy: "Under $450K", icon: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><circle cx="12" cy="14" r="2" /><path d="M12 16v4" /></>, patch: { max: "450000" } },
  { title: "Family home", copy: "3+ bed houses", icon: <><circle cx="8" cy="7" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M2.5 20c.6-4 3-6 5.5-6s4.9 2 5.5 6M13.5 20c.4-3 1.8-4.6 3.5-4.6s3.1 1.6 3.5 4.6" /></>, patch: { beds: "3", type: "Detached" } },
  { title: "Luxury", copy: "$1M and up", icon: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M12 21 8 9l4-6 4 6z" /></>, patch: { min: "1000000" } },
  { title: "New this week", copy: "Just listed", icon: <><path d="M12 2.5 14.6 9l6.9.5-5.3 4.4 1.7 6.7L12 16.9l-5.9 3.7 1.7-6.7L2.5 9.5 9.4 9z" /></>, patch: { status: "new" } },
  { title: "Open houses", copy: "Visit in person", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3v3H8z" /></>, patch: { status: "open-house" } },
  { title: "Income suite", copy: "Mortgage helper", icon: <><path d="M3 21V9l9-6 9 6v12" /><path d="M3 14h18M9 21v-4h6v4" /></>, patch: { features: ["suite"] } },
  { title: "Condo living", copy: "Low maintenance", icon: TYPE_ICONS.condo, patch: { type: "Condo" } },
  { title: "Acreage", copy: "Room to roam", icon: TYPE_ICONS.land, patch: { type: "Acreage" } },
];

export const pickIsOn = (state: FilterState, patch: Partial<FilterState>) => Object.entries(patch).every(([key, value]) => {
  const current = state[key as keyof FilterState];
  return Array.isArray(value) ? value.every(item => (current as string[]).includes(item)) : current === value;
});
const pickOff = (state: FilterState, patch: Partial<FilterState>): Partial<FilterState> => Object.fromEntries(Object.entries(patch).map(([key, value]) =>
  [key, Array.isArray(value) ? (state[key as keyof FilterState] as string[]).filter(item => !value.includes(item)) : ""]));
export const merge = (state: FilterState, patch: Partial<FilterState>): FilterState => ({
  ...state, ...patch, features: patch.features ? [...new Set([...state.features, ...patch.features])] : state.features,
});

/** Counts up/down to the new number instead of jumping. */
export function useRollingNumber(target: number | null) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (target === null) return;
    const start = from.current ?? target;
    if (start === target) { from.current = target; setShown(target); return; }
    const begin = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / 450);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(start + (target - start) * eased);
      setShown(value);
      from.current = value;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return target === null ? null : shown;
}

export function ListingFilter({ initial = EMPTY_FILTERS, hidden = {}, priceBins = [], initialTotal = null, initialPanel = null }: {
  initial?: FilterState; hidden?: Record<string, string>; priceBins?: number[]; initialTotal?: number | null; initialPanel?: Panel | null;
}) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState(initial.query);
  const [open, setOpen] = useState<Panel | null>(initialPanel);
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [example, setExample] = useState(0);
  const [focused, setFocused] = useState(false);
  // The "All filters" window is portalled to <body>, which only exists in the browser.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const form = useRef<HTMLFormElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // What the smart box understands right now, merged over the structured filters.
  const smart = useMemo(() => parseSmartSearch(draft), [draft]);
  // Changing a panel takes over from the typed text: what was understood becomes
  // regular filters and only the location words stay in the box.
  const set = (patch: Partial<FilterState>) => {
    setState(current => ({ ...merge(current, smart.patch), ...patch }));
    if (smart.tokens.length) setDraft(smart.rest);
  };
  const effective = useMemo(() => ({ ...merge(state, smart.patch), query: smart.rest }), [state, smart]);
  const params = useMemo(() => toParams(effective, hidden), [effective, hidden]);
  const query = params.toString();
  const rolling = useRollingNumber(total);

  // Live count, debounced while the visitor types or adjusts filters.
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

  // Cycle the example searches while the box is empty.
  useEffect(() => {
    if (draft || focused) return;
    const timer = window.setInterval(() => setExample(current => (current + 1) % EXAMPLES.length), 3200);
    return () => window.clearInterval(timer);
  }, [draft, focused]);

  // Close panels on outside click and Escape; lock page scroll while "All filters" is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (open !== "more" && !bar.current?.contains(event.target as Node)) setOpen(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    if (open === "more") document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const submit = () => { setOpen(null); window.setTimeout(() => form.current?.requestSubmit(), 0); };
  const toggle = (panel: Panel) => setOpen(current => current === panel ? null : panel);
  // Applying a quick pick searches straight away.
  const quickPick = (patch: Partial<FilterState>) => {
    setState(current => pickIsOn(merge(current, smart.patch), patch) ? { ...merge(current, smart.patch), ...pickOff(merge(current, smart.patch), patch) } : merge(merge(current, smart.patch), patch));
    setDraft(smart.rest);
    submit();
  };

  // Refine pill summaries (from the effective filters, so typed criteria show up too).
  const e = effective;
  const status = STATUS_CHOICES.find(choice => choice.value === e.status);
  const priceText = e.min || e.max ? priceRangeLabel(Number(e.min) || undefined, Number(e.max) || undefined) : "";
  const roomsText = [e.beds && `${e.beds}+ bd`, e.baths && `${e.baths}+ ba`].filter(Boolean).join(" · ");
  const typeChoice = TYPE_CHOICES.find(choice => choice.value.toLowerCase() === state.type.toLowerCase());
  const shownType = TYPE_CHOICES.find(choice => choice.value.toLowerCase() === e.type.toLowerCase());
  const moreKeys: (keyof FilterState)[] = ["city", "sqft", "maxSqft", "year", "maxYear", "lot", "days", "parking", "text", "fee"];
  const moreCount = moreKeys.filter(key => e[key]).length + e.features.length;

  // Chips describe the filters already applied (the page's URL), each removable.
  const chips: Chip[] = [];
  const a = initial;
  if (a.query) chips.push({ label: `“${a.query}”`, remove: { query: "" } });
  if (a.city) chips.push({ label: a.city, remove: { city: "" } });
  if (a.status) chips.push({ label: STATUS_CHOICES.find(choice => choice.value === a.status)?.title ?? a.status, remove: { status: "" } });
  if (a.min || a.max) chips.push({ label: priceRangeLabel(Number(a.min) || undefined, Number(a.max) || undefined), remove: { min: "", max: "" } });
  if (a.beds) chips.push({ label: `${a.beds}+ beds`, remove: { beds: "" } });
  if (a.baths) chips.push({ label: `${a.baths}+ baths`, remove: { baths: "" } });
  if (a.type) chips.push({ label: TYPE_CHOICES.find(choice => choice.value.toLowerCase() === a.type.toLowerCase())?.title ?? a.type, remove: { type: "" } });
  if (a.sqft || a.maxSqft) chips.push({ label: `${a.sqft ? count.format(Number(a.sqft)) : "Any"}–${a.maxSqft ? count.format(Number(a.maxSqft)) : "any"} sq ft`, remove: { sqft: "", maxSqft: "" } });
  if (a.lot) chips.push({ label: `${a.lot}+ acre lot`, remove: { lot: "" } });
  if (a.year || a.maxYear) chips.push({ label: `Built ${a.year || "any"}–${a.maxYear || "today"}`, remove: { year: "", maxYear: "" } });
  if (a.days) chips.push({ label: `Listed in last ${a.days} ${a.days === "1" ? "day" : "days"}`, remove: { days: "" } });
  if (a.parking) chips.push({ label: `${a.parking}+ parking`, remove: { parking: "" } });
  if (a.fee) chips.push({ label: `Fees under ${money.format(Number(a.fee))}/mo`, remove: { fee: "" } });
  if (a.text) chips.push({ label: `“${a.text}” in description`, remove: { text: "" } });
  for (const feature of a.features) {
    const choice = FEATURE_CHOICES.find(item => item.value === feature);
    if (choice) chips.push({ label: choice.label, remove: { features: a.features.filter(item => item !== feature) } });
  }
  if (hidden.bounds) {
    const { bounds: _area, ...rest } = hidden;
    void _area;
    const next = toParams(a, rest).toString();
    chips.unshift({ label: "Map area", remove: {}, href: `/search?${next ? `${next}&` : ""}view=map#listing-results` });
  }
  const chipHref = (remove: Partial<FilterState>) => { const next = toParams({ ...a, ...remove }, hidden).toString(); return `/search${next ? `?${next}` : ""}#listing-results`; };
  const mapParams = new URLSearchParams(toParams(a, hidden));
  mapParams.set("view", "map");

  const pill = (panel: Panel, label: string, value: string) => <button type="button" className={`lf-pill${value ? " is-set" : ""}`} aria-expanded={open === panel} aria-haspopup="dialog" onClick={() => toggle(panel)}>
    <span>{label}</span>{value && <b>{value}</b>}<Chevron />
  </button>;

  return <Form ref={form} action="/search" scroll={false} className="listing-filter smart-filter shell" onSubmit={() => { setState(effective); setDraft(smart.rest); }}>
    {[...params.entries()].map(([key, value]) => <input type="hidden" name={key} value={value} key={key} />)}

    <div className="sf-head">
      <p><span className="sf-spark" aria-hidden="true">✦</span> SMART SEARCH</p>
      <Link href={`/search?${mapParams}#listing-results`} scroll={false}>Map view →</Link>
    </div>

    <div className="sf-search">
      <label className="sf-input">
        <SearchIcon />
        <span className="sf-field">
          <input value={draft} onChange={event => setDraft(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            aria-label="Describe the home you want, or search a community, address or MLS® number" autoComplete="off" spellCheck={false} />
          {!draft && <span className="sf-example" key={example} aria-hidden="true">{focused ? "Try: " : ""}{EXAMPLES[example]}</span>}
        </span>
        {draft && <button type="button" className="sf-clear" aria-label="Clear search" onClick={() => setDraft("")}>×</button>}
      </label>
      <button type="submit" className="sf-go" aria-live="polite">
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
      </> : <span>Describe the home you want in your own words — beds, budget, area, features — or pick a starting point below.</span>}
    </div>

    <div className="sf-picks" role="group" aria-label="Quick picks">
      {QUICK_PICKS.map(pick => <button type="button" key={pick.title} aria-pressed={pickIsOn(effective, pick.patch)} onClick={() => quickPick(pick.patch)}>
        <i>{icon(pick.icon, 20)}</i><span><b>{pick.title}</b><small>{pick.copy}</small></span>
      </button>)}
    </div>

    <div className="sf-refine" ref={bar}>
      <span className="sf-refine-label">Refine</span>
      <div className="lf-slot">
        {pill("price", "Price", priceText)}
        {open === "price" && <div className="lf-panel lf-panel-wide" role="dialog" aria-label="Price">
          <PricePicker state={effective} set={set} bins={priceBins} />
          <PanelFooter onReset={() => set({ min: "", max: "" })} onApply={submit} />
        </div>}
      </div>
      <div className="lf-slot">
        {pill("rooms", "Beds & baths", roomsText)}
        {open === "rooms" && <div className="lf-panel lf-panel-wide" role="dialog" aria-label="Beds and baths">
          <Pills label="Beds" hint="Minimum number of bedrooms" options={BED_OPTIONS} value={effective.beds} onChange={beds => set({ beds })} />
          <Pills label="Baths" hint="Minimum number of bathrooms" options={BATH_OPTIONS} value={effective.baths} onChange={baths => set({ baths })} />
          <PanelFooter onReset={() => set({ beds: "", baths: "" })} onApply={submit} />
        </div>}
      </div>
      <div className="lf-slot">
        {pill("type", "Home type", shownType?.title ?? "")}
        {open === "type" && <div className="lf-panel lf-panel-types" role="dialog" aria-label="Property type">
          <div className="lf-type-grid">
            {TYPE_CHOICES.map(choice => <button type="button" role="radio" aria-checked={shownType === choice} key={choice.value} onClick={() => set({ type: typeChoice === choice ? "" : choice.value })}>
              <i>{icon(TYPE_ICONS[choice.icon], 20)}</i><span><b>{choice.title}</b><small>{choice.copy}</small></span>
            </button>)}
          </div>
          <PanelFooter onReset={() => set({ type: "" })} onApply={submit} />
        </div>}
      </div>
      <div className="lf-slot">
        {pill("status", "Status", status?.value ? status.title : "")}
        {open === "status" && <div className="lf-panel" role="dialog" aria-label="Listing status">
          <div className="lf-option-list">
            {STATUS_CHOICES.map(choice => <button type="button" role="radio" aria-checked={effective.status === choice.value} key={choice.value} onClick={() => set({ status: choice.value })}>
              <i aria-hidden="true" /><span><b>{choice.title}</b><small>{choice.copy}</small></span>
            </button>)}
          </div>
          <PanelFooter onReset={() => set({ status: "" })} onApply={submit} />
        </div>}
      </div>
      <button type="button" className={`lf-pill sf-all${moreCount ? " is-set" : ""}`} aria-expanded={open === "more"} aria-haspopup="dialog" onClick={() => toggle("more")}>
        <SlidersIcon /><span>All filters</span>{moreCount > 0 && <b>{moreCount}</b>}
      </button>
    </div>

    {/* Rendered at the end of <body> (still inside the form for React) so no page layer can cover it. */}
    {open === "more" && mounted && createPortal(<div className="lf-modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setOpen(null); }}>
      <div className="lf-modal" role="dialog" aria-modal="true" aria-labelledby="lf-modal-title">
        <header>
          <div><h2 id="lf-modal-title">All filters</h2><p>Fine-tune your Calgary home search</p></div>
          <button type="button" aria-label="Close filters" onClick={() => setOpen(null)}>×</button>
        </header>
        <div className="lf-modal-body">
          <section>
            <h3>Property details</h3>
            <label className="lf-field"><span>Area</span>
              <select value={effective.city} onChange={event => set({ city: event.target.value })}>
                <option value="">Calgary &amp; surrounding areas</option>
                {CITY_OPTIONS.slice(1).map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <RangeSelect label="Square feet" options={SQFT_STEPS} min={effective.sqft} max={effective.maxSqft} onMin={sqft => set({ sqft })} onMax={maxSqft => set({ maxSqft })} format={value => count.format(value)} />
            <label className="lf-field"><span>Lot size</span>
              <select value={effective.lot} onChange={event => set({ lot: event.target.value })}>
                <option value="">Any lot size</option>
                {LOT_STEPS.map(option => <option key={option} value={option}>{option}+ {option === 1 ? "acre" : "acres"}</option>)}
              </select>
            </label>
            <RangeSelect label="Year built" options={YEAR_STEPS} min={effective.year} max={effective.maxYear} onMin={year => set({ year })} onMax={maxYear => set({ maxYear })} format={String} />
            <label className="lf-field"><span>Time on market</span>
              <select value={effective.days} onChange={event => set({ days: event.target.value })}>
                <option value="">Any time</option>
                {DAY_STEPS.map(option => <option key={option} value={option}>Listed in the last {option} {option === 1 ? "day" : "days"}</option>)}
              </select>
            </label>
          </section>
          <section>
            <h3>Home features</h3>
            <Pills label="Parking spots" options={PARKING_OPTIONS} value={effective.parking} onChange={parking => set({ parking })} />
            <div className="lf-checks">
              {FEATURE_CHOICES.map(choice => <label key={choice.value}>
                <input type="checkbox" checked={effective.features.includes(choice.value)}
                  onChange={event => set({ features: event.target.checked ? [...new Set([...effective.features, choice.value])] : effective.features.filter(item => item !== choice.value) })} />
                <span>{choice.label}</span>
              </label>)}
            </div>
            <label className="lf-field"><span>Keyword in the description</span>
              <input value={effective.text} onChange={event => set({ text: event.target.value.slice(0, 60) })} placeholder="e.g. walkout, vaulted ceilings, chef's kitchen" />
            </label>
            <h3>Cost</h3>
            <label className="lf-field"><span>Condo fees (max / month)</span>
              <select value={effective.fee} onChange={event => set({ fee: event.target.value })}>
                <option value="">No max</option>
                {FEE_STEPS.map(option => <option key={option} value={option}>{money.format(option)}</option>)}
              </select>
            </label>
          </section>
        </div>
        <footer>
          <button type="button" className="lf-reset" onClick={() => set({ city: "", sqft: "", maxSqft: "", year: "", maxYear: "", lot: "", days: "", parking: "", features: [], text: "", fee: "" })}>Reset all</button>
          <button type="button" className="lf-apply" onClick={submit}>{total === null ? "See homes" : `See ${count.format(total)} homes`}</button>
        </footer>
      </div>
    </div>, document.body)}

    <div className="listing-filter-foot">
      {chips.length ? <>
        <span>Showing:</span>
        {chips.map(chip => <Link className="filter-chip" href={chip.href ?? chipHref(chip.remove)} scroll={false} key={chip.label} aria-label={`Remove filter ${chip.label}`}>{chip.label}<i aria-hidden="true">×</i></Link>)}
        <Link className="filter-clear" href="/search#listing-results" scroll={false}>Clear all</Link>
      </> : <span>All current MLS® listings across Calgary, Airdrie, Chestermere and Cochrane.</span>}
    </div>
  </Form>;
}
