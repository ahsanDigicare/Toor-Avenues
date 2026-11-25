"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ValueEstimate } from "../lib/listings";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-CA");
const digits = (text: string) => Number(text.replace(/[^\d.]/g, "")) || 0;

function MoneyInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint?: string }) {
  return <label className="mt-field">
    <span>{label}</span>
    <span className="mt-money"><i>$</i><input inputMode="numeric" value={value ? count.format(value) : ""} placeholder="0" onChange={event => onChange(Math.min(99_000_000, digits(event.target.value)))} /></span>
    {hint && <small>{hint}</small>}
  </label>;
}

/** Monthly payment with Canadian semi-annual compounding. */
function monthlyPayment(principal: number, annualRate: number, years: number) {
  if (principal <= 0) return 0;
  const rate = Math.pow(1 + annualRate / 100 / 2, 1 / 6) - 1;
  const months = years * 12;
  return rate ? principal * rate / (1 - Math.pow(1 + rate, -months)) : principal / months;
}

/** Federal minimum down payment (insured mortgages up to $1.5M). */
function minimumDown(price: number) {
  if (price >= 1_500_000) return price * 0.2;
  if (price <= 500_000) return price * 0.05;
  return 25_000 + (price - 500_000) * 0.1;
}

function cmhcPremium(price: number, down: number) {
  const percent = down / price;
  if (price >= 1_500_000 || percent >= 0.2) return 0;
  const loan = price - down;
  return loan * (percent >= 0.15 ? 0.028 : percent >= 0.1 ? 0.031 : 0.04);
}

// ---------------------------------------------------------------------------
// SELL: home value estimator
// ---------------------------------------------------------------------------

type EstimateCity = { city: string; province: string; code: string; count: number };
const ESTIMATE_TYPES = ["Detached", "Semi-detached", "Townhouse", "Condo", "Bungalow"];

export function HomeValueEstimator({ cities }: { cities: EstimateCity[] }) {
  const [place, setPlace] = useState(""); // "City|Province"
  const [communities, setCommunities] = useState<{ community: string; count: number }[]>([]);
  const [community, setCommunity] = useState("");
  const [type, setType] = useState("Detached");
  const [beds, setBeds] = useState(3);
  const [sqft, setSqft] = useState(1600);
  const [result, setResult] = useState<ValueEstimate | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const [city, province] = place.split("|");

  // Cities grouped by province (busiest provinces and cities first).
  const groups = useMemo(() => {
    const byProvince = new Map<string, EstimateCity[]>();
    for (const item of cities) byProvince.set(item.province, [...(byProvince.get(item.province) ?? []), item]);
    return [...byProvince].map(([name, list]) => ({ name, list: [...list].sort((a, b) => a.city.localeCompare(b.city)) }));
  }, [cities]);

  // Communities of the chosen city, loaded when the city changes.
  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    fetch(`/api/market/communities?${new URLSearchParams({ city, province })}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : { communities: [] })
      .then((data: { communities: { community: string; count: number }[] }) => setCommunities(data.communities ?? []))
      .catch(() => { /* aborted or offline: keep the list empty */ });
    return () => controller.abort();
  }, [city, province]);

  const choosePlace = (value: string) => { setPlace(value); setCommunity(""); setCommunities([]); setResult(null); };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ type, beds: String(beds), sqft: String(sqft), city, province });
    if (community) params.set("community", community);
    setBusy(true);
    try {
      const response = await fetch(`/api/market/estimate?${params}`);
      const data = await response.json() as { estimate: ValueEstimate | null };
      setResult(data.estimate ?? "none");
    } catch { setResult("none"); }
    setBusy(false);
  };

  const where = community || city;
  const contact = `/contact?interest=home-value${where ? `&community=${encodeURIComponent(where)}` : ""}`;

  return <div className="mt-card mt-estimator">
    <form className="mt-estimator-form" onSubmit={run}>
      <label className="mt-field"><span>City</span>
        <select value={place} onChange={event => choosePlace(event.target.value)} required>
          <option value="">Choose your city…</option>
          {groups.map(group => <optgroup label={group.name} key={group.name}>
            {group.list.map(item => <option key={`${item.city}|${item.province}`} value={`${item.city}|${item.province}`}>{item.city}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className="mt-field"><span>Community <small>(optional)</small></span>
        <select value={community} onChange={event => setCommunity(event.target.value)} disabled={!city || !communities.length}>
          <option value="">{city ? "Whole city" : "Choose a city first"}</option>
          {communities.map(item => <option key={item.community} value={item.community}>{item.community}</option>)}
        </select>
      </label>
      <label className="mt-field"><span>Home type</span>
        <select value={type} onChange={event => setType(event.target.value)}>{ESTIMATE_TYPES.map(option => <option key={option}>{option}</option>)}</select>
      </label>
      <label className="mt-field"><span>Bedrooms</span>
        <select value={beds} onChange={event => setBeds(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(option => <option key={option} value={option}>{option}{option === 6 ? "+" : ""}</option>)}</select>
      </label>
      <label className="mt-field mt-wide"><span>Size (sq ft above grade)</span>
        <input type="number" min={300} max={15000} step={50} value={sqft} onChange={event => setSqft(Number(event.target.value))} />
      </label>
      <button className="mt-primary" type="submit" disabled={busy}>{busy ? "Estimating…" : "Estimate my home value"}</button>
    </form>

    <div className="mt-estimate-result" aria-live="polite">
      {result === null && <div className="mt-empty"><b>Your estimate appears here</b><span>Based on comparable homes for sale right now in your city or community.</span></div>}
      {result === "none" && <div className="mt-empty"><b>Not enough comparable homes right now</b><span>We will prepare a detailed evaluation from recent sales instead.</span><Link className="mt-primary" href={contact}>Request a free evaluation</Link></div>}
      {result && result !== "none" && <>
        <p className="mt-kicker">ESTIMATED MARKET RANGE</p>
        <p className="mt-range"><b>{money.format(result.mid)}</b></p>
        <div className="mt-range-bar" aria-hidden="true"><span style={{ left: "0%" }} /><i /><span style={{ left: "100%" }} /></div>
        <div className="mt-range-ends"><span>{money.format(result.low)}</span><span>{money.format(result.high)}</span></div>
        <p className="mt-basis">From {count.format(result.sample)} {result.basis} (asking prices). A precise evaluation also weighs recent sales, condition and upgrades.</p>
        {result.comparables.length > 0 && <>
          <p className="mt-kicker">COMPARABLE HOMES FOR SALE</p>
          <div className="mt-comps">{result.comparables.map(home => <Link key={home.id} href={`/listing/${home.slug}`} className="mt-comp">
            <span>{home.photo && <Image src={home.photo} alt="" fill sizes="96px" />}</span>
            <div><b>{home.priceLabel}</b><small>{home.address}</small><small>{home.beds ?? "–"} bd · {home.baths ?? "–"} ba{home.sqft ? ` · ${count.format(home.sqft)} sq ft` : ""}</small></div>
          </Link>)}</div>
        </>}
        <Link className="mt-primary" href={contact}>Get my precise evaluation →</Link>
      </>}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// SELL: net proceeds
// ---------------------------------------------------------------------------

export function NetProceedsCalculator({ defaultPrice = 650_000 }: { defaultPrice?: number }) {
  const [price, setPrice] = useState(defaultPrice);
  const [mortgage, setMortgage] = useState(380_000);
  const [structure, setStructure] = useState<"tiered" | "flat">("tiered");
  const [flat, setFlat] = useState(4);
  const [legal, setLegal] = useState(1_200);
  const [other, setOther] = useState(1_500);

  const commission = structure === "tiered" ? Math.min(price, 100_000) * 0.07 + Math.max(0, price - 100_000) * 0.03 : price * flat / 100;
  const gst = commission * 0.05;
  const net = price - mortgage - commission - gst - legal - other;
  const rows: [string, number][] = [["Mortgage payout", mortgage], ["Real estate commission", commission], ["GST on commission (5%)", gst], ["Legal fees & disbursements", legal], ["Other (moving, repairs, discharge)", other]];
  const max = Math.max(price, 1);

  return <div className="mt-card mt-split">
    <div className="mt-inputs">
      <MoneyInput label="Expected sale price" value={price} onChange={setPrice} />
      <MoneyInput label="Remaining mortgage" value={mortgage} onChange={setMortgage} />
      <label className="mt-field"><span>Commission</span>
        <select value={structure} onChange={event => setStructure(event.target.value as "tiered" | "flat")}>
          <option value="tiered">7% on first $100K + 3% on the balance</option>
          <option value="flat">Flat percentage</option>
        </select>
      </label>
      {structure === "flat" && <label className="mt-field"><span>Commission rate (%)</span><input type="number" min={0} max={10} step={0.25} value={flat} onChange={event => setFlat(Number(event.target.value))} /></label>}
      <MoneyInput label="Legal fees" value={legal} onChange={setLegal} />
      <MoneyInput label="Other costs" value={other} onChange={setOther} />
    </div>
    <div className="mt-output">
      <p className="mt-kicker">ESTIMATED CASH AT CLOSING</p>
      <p className={`mt-big${net < 0 ? " is-negative" : ""}`}>{money.format(Math.round(net))}</p>
      <div className="mt-stack" aria-hidden="true">
        <span style={{ width: `${Math.max(0, net) / max * 100}%` }} className="net" />
        <span style={{ width: `${mortgage / max * 100}%` }} className="mortgage" />
        <span style={{ width: `${(commission + gst + legal + other) / max * 100}%` }} className="costs" />
      </div>
      <dl className="mt-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>−{money.format(Math.round(value))}</dd></div>)}</dl>
      <small className="mt-note">Estimate only. Commission is negotiable; mortgage penalties depend on your lender. We will walk through your exact numbers with you.</small>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// BUY: affordability (GDS / TDS with the federal stress test)
// ---------------------------------------------------------------------------

export function AffordabilityCalculator() {
  const [income, setIncome] = useState(140_000);
  const [debts, setDebts] = useState(600);
  const [down, setDown] = useState(60_000);
  const [rate, setRate] = useState(4.5);
  const [years, setYears] = useState(25);
  const [condoFees, setCondoFees] = useState(0);
  const [homes, setHomes] = useState<number | null>(null);

  const result = useMemo(() => {
    const monthlyIncome = income / 12;
    const qualifyingRate = Math.max(rate + 2, 5.25);
    const maxHousing = Math.min(monthlyIncome * 0.39, monthlyIncome * 0.44 - debts);
    const costs = (price: number) => {
      const premium = cmhcPremium(price, Math.min(down, price));
      const loan = Math.max(0, price - down) + premium;
      return { loan, premium, tax: price * 0.0065 / 12, heat: 100, condo: condoFees / 2 };
    };
    const fitsIncome = (price: number) => { const c = costs(price); return monthlyPayment(c.loan, qualifyingRate, years) + c.tax + c.heat + c.condo <= maxHousing; };
    const fitsDown = (price: number) => down >= minimumDown(price);
    let low = 0, high = 5_000_000;
    for (let i = 0; i < 40; i++) { const middle = (low + high) / 2; if (fitsIncome(middle) && fitsDown(middle)) low = middle; else high = middle; }
    const price = Math.floor(low / 1000) * 1000;
    const c = costs(price);
    const payment = monthlyPayment(c.loan, rate, years);
    const limitedBy = !fitsDown(price + 5000) && fitsIncome(price + 5000) ? "down payment" : "income";
    return { price, payment, qualifyingRate, tax: c.tax, premium: c.premium, loan: c.loan, limitedBy, maxHousing };
  }, [income, debts, down, rate, years, condoFees]);

  useEffect(() => {
    if (result.price <= 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/listings/count?max=${result.price}`, { signal: controller.signal })
        .then(response => response.json()).then((data: { total?: number }) => setHomes(typeof data.total === "number" ? data.total : null)).catch(() => {});
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [result.price]);

  return <div className="mt-card mt-split">
    <div className="mt-inputs">
      <MoneyInput label="Household income (yearly, before tax)" value={income} onChange={setIncome} />
      <MoneyInput label="Monthly debt payments" value={debts} onChange={setDebts} hint="Car loans, credit cards, lines of credit" />
      <MoneyInput label="Down payment saved" value={down} onChange={setDown} />
      <div className="mt-two">
        <label className="mt-field"><span>Interest rate (%)</span><input type="number" min={0} max={15} step={0.05} value={rate} onChange={event => setRate(Number(event.target.value))} /></label>
        <label className="mt-field"><span>Amortization</span><select value={years} onChange={event => setYears(Number(event.target.value))}><option value={25}>25 years</option><option value={30}>30 years (first-time / new build)</option></select></label>
      </div>
      <MoneyInput label="Condo fees (monthly, if any)" value={condoFees} onChange={setCondoFees} />
    </div>
    <div className="mt-output">
      <p className="mt-kicker">YOU COULD AFFORD UP TO</p>
      <p className="mt-big">{result.price > 0 ? money.format(result.price) : "—"}</p>
      <p className="mt-sub">Est. {money.format(Math.round(result.payment))}/month mortgage at {rate}% · limited by your {result.limitedBy}</p>
      <dl className="mt-rows">
        <div><dt>Mortgage amount{result.premium ? " (incl. CMHC insurance)" : ""}</dt><dd>{money.format(Math.round(result.loan))}</dd></div>
        <div><dt>Stress-test rate you must qualify at</dt><dd>{result.qualifyingRate.toFixed(2)}%</dd></div>
        <div><dt>Property tax (est.)</dt><dd>{money.format(Math.round(result.tax))}/mo</dd></div>
        <div><dt>Max housing costs (39% of income)</dt><dd>{money.format(Math.round(result.maxHousing))}/mo</dd></div>
      </dl>
      {result.price > 0 && <Link className="mt-primary" href={`/search?max=${result.price}#listing-results`}>
        {homes === null ? "See homes in your budget" : `See ${count.format(homes)} homes up to ${money.format(result.price)}`} →
      </Link>}
      <small className="mt-note">Uses the federal stress test and standard 39% / 44% debt ratios. A lender pre-approval confirms your real number.</small>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// BUY: closing costs by province (land transfer tax / registration fees)
// ---------------------------------------------------------------------------

/** Tax on `price` from [upTo, rate] brackets (the last bracket's upTo is Infinity). */
function bracketTax(price: number, brackets: [number, number][]) {
  let tax = 0, from = 0;
  for (const [upTo, rate] of brackets) {
    if (price > from) tax += (Math.min(price, upTo) - from) * rate;
    from = upTo;
  }
  return Math.round(tax);
}

const ON_BRACKETS: [number, number][] = [[55_000, 0.005], [250_000, 0.01], [400_000, 0.015], [2_000_000, 0.02], [Infinity, 0.025]];
const TORONTO_BRACKETS: [number, number][] = [[55_000, 0.005], [250_000, 0.01], [400_000, 0.015], [2_000_000, 0.02], [3_000_000, 0.025],
  [4_000_000, 0.035], [5_000_000, 0.045], [10_000_000, 0.055], [20_000_000, 0.065], [Infinity, 0.075]];
const BC_BRACKETS: [number, number][] = [[200_000, 0.01], [2_000_000, 0.02], [3_000_000, 0.03], [Infinity, 0.05]];
const MB_BRACKETS: [number, number][] = [[30_000, 0], [90_000, 0.005], [150_000, 0.01], [200_000, 0.015], [Infinity, 0.02]];
const QC_BRACKETS: [number, number][] = [[61_500, 0.005], [307_800, 0.01], [Infinity, 0.015]];
const titleFee = (value: number) => value ? 50 + Math.ceil(value / 5000) * 5 : 0; // Alberta land titles

type ClosingTax = { rows: [string, number][]; note: string; firstTimeHelp: boolean; torontoOption: boolean };

/** Government taxes and registration fees for a purchase (approximate; rates as published for 2025). */
function closingTaxes(code: string, price: number, mortgage: number, firstTime: boolean, toronto: boolean): ClosingTax {
  switch (code) {
    case "ON": {
      const provincial = bracketTax(price, ON_BRACKETS);
      const rows: [string, number][] = [["Ontario land transfer tax", provincial]];
      if (firstTime) rows.push(["First-time buyer refund (Ontario)", -Math.min(4_000, provincial)]);
      if (toronto) {
        const municipal = bracketTax(price, TORONTO_BRACKETS);
        rows.push(["Toronto municipal land transfer tax", municipal]);
        if (firstTime) rows.push(["First-time buyer rebate (Toronto)", -Math.min(4_475, municipal)]);
      }
      rows.push(["Registration fees", 160]);
      return { rows, note: "Ontario land transfer tax applies province-wide; buyers in the City of Toronto pay a second, municipal tax.", firstTimeHelp: true, torontoOption: true };
    }
    case "BC": {
      const tax = bracketTax(price, BC_BRACKETS);
      // First-time buyers: no tax on the first $500,000 up to $835,000, phasing out by $860,000.
      const exemption = !firstTime ? 0 : price <= 835_000 ? Math.min(tax, 8_000) : price < 860_000 ? Math.round(8_000 * (860_000 - price) / 25_000) : 0;
      const rows: [string, number][] = [["BC property transfer tax", tax]];
      if (exemption) rows.push(["First-time buyer exemption", -exemption]);
      rows.push(["Land title registration fees", 230]);
      return { rows, note: "BC property transfer tax: 1% to $200,000, 2% to $2M, 3% to $3M, 5% above. Newly built homes can qualify for further exemptions.", firstTimeHelp: true, torontoOption: false };
    }
    case "AB":
      return { rows: [["Land title transfer fee", titleFee(price)], ["Mortgage registration fee", titleFee(mortgage)]],
        note: "Alberta has no land transfer tax: land titles fees are $50 + $5 per $5,000 of value.", firstTimeHelp: false, torontoOption: false };
    case "SK":
      return { rows: [["Land titles transfer fee", Math.round(Math.max(0, price - 6_300) * 0.004)], ["Mortgage registration", mortgage ? 200 : 0]],
        note: "Saskatchewan has no land transfer tax: the title transfer fee is about 0.4% of the value over $6,300.", firstTimeHelp: false, torontoOption: false };
    case "MB":
      return { rows: [["Manitoba land transfer tax", bracketTax(price, MB_BRACKETS)], ["Registration fees", 140]],
        note: "Manitoba land transfer tax: 0% to $30,000, then 0.5%–2% in steps.", firstTimeHelp: false, torontoOption: false };
    case "QC":
      return { rows: [["Welcome tax (transfer duties)", bracketTax(price, QC_BRACKETS)], ["Notary & registration", 1_500]],
        note: "Quebec's welcome tax uses indexed brackets; Montreal adds higher rates above about $500,000.", firstTimeHelp: false, torontoOption: false };
    case "NB":
      return { rows: [["Real property transfer tax (1%)", Math.round(price * 0.01)], ["Registration fees", 100]],
        note: "New Brunswick charges 1% of the greater of the price and the assessed value.", firstTimeHelp: false, torontoOption: false };
    case "NS":
      return { rows: [["Deed transfer tax (about 1.5%)", Math.round(price * 0.015)], ["Registration fees", 100]],
        note: "Nova Scotia deed transfer tax is set by each municipality (up to 1.5%; Halifax charges 1.5%).", firstTimeHelp: false, torontoOption: false };
    case "PE": {
      const tax = Math.round(price * 0.01);
      return { rows: [["Real property transfer tax (1%)", tax], ...(firstTime ? [["First-time buyer exemption", -tax] as [string, number]] : []), ["Registration fees", 100]],
        note: "PEI charges 1% of the greater of the price and the assessed value; first-time buyers are exempt.", firstTimeHelp: true, torontoOption: false };
    }
    case "NL":
      return { rows: [["Deed registration", Math.round(100 + Math.max(0, price - 500) * 0.004)], ["Mortgage registration", mortgage ? Math.round(100 + Math.max(0, mortgage - 500) * 0.004) : 0]],
        note: "Newfoundland and Labrador has no land transfer tax: registration fees are $100 + 0.4% of the value over $500.", firstTimeHelp: false, torontoOption: false };
    default:
      return { rows: [["Land titles registration (approx.)", 250]], note: "Territorial land titles fees are small flat or value-based charges.", firstTimeHelp: false, torontoOption: false };
  }
}

const CLOSING_PROVINCES: [string, string][] = [["ON", "Ontario"], ["BC", "British Columbia"], ["AB", "Alberta"], ["QC", "Quebec"], ["NS", "Nova Scotia"],
  ["NB", "New Brunswick"], ["SK", "Saskatchewan"], ["MB", "Manitoba"], ["NL", "Newfoundland & Labrador"], ["PE", "Prince Edward Island"], ["YT", "Yukon"], ["NT", "Northwest Territories"], ["NU", "Nunavut"]];

export function ClosingCostEstimator({ defaultPrice = 650_000 }: { defaultPrice?: number }) {
  const [price, setPrice] = useState(defaultPrice);
  const [down, setDown] = useState(Math.round(defaultPrice * 0.1));
  const [province, setProvince] = useState("ON");
  const [firstTime, setFirstTime] = useState(false);
  const [toronto, setToronto] = useState(false);
  const mortgage = Math.max(0, price - down);
  const taxes = closingTaxes(province, price, mortgage, firstTime, toronto);
  const rows: [string, number][] = [
    ...taxes.rows,
    ["Legal fees & disbursements", province === "ON" || province === "BC" ? 2_000 : 1_500],
    ["Home inspection", 550],
    ["Title insurance", 300],
    ["Appraisal (if your lender requires one)", 350],
  ];
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  return <div className="mt-card mt-split">
    <div className="mt-inputs">
      <label className="mt-field"><span>Province or territory</span>
        <select value={province} onChange={event => { setProvince(event.target.value); setToronto(false); }}>
          {CLOSING_PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <MoneyInput label="Purchase price" value={price} onChange={setPrice} />
      <MoneyInput label="Down payment" value={down} onChange={setDown} />
      {taxes.firstTimeHelp && <label className="mt-check"><input type="checkbox" checked={firstTime} onChange={event => setFirstTime(event.target.checked)} /> First-time home buyer</label>}
      {taxes.torontoOption && <label className="mt-check"><input type="checkbox" checked={toronto} onChange={event => setToronto(event.target.checked)} /> Buying in the City of Toronto</label>}
      <p className="mt-callout">{taxes.note}</p>
    </div>
    <div className="mt-output">
      <p className="mt-kicker">ESTIMATED CLOSING COSTS</p>
      <p className="mt-big">{money.format(total)}</p>
      <p className="mt-sub">About {price ? (total / price * 100).toFixed(2) : "0"}% of the purchase price, plus property tax and utility adjustments.</p>
      <dl className="mt-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value < 0 ? `−${money.format(-value)}` : money.format(value)}</dd></div>)}</dl>
      <small className="mt-note">Government taxes and fees are estimates from published provincial rates; your lawyer or notary confirms the exact amounts. Professional fees are typical ranges.</small>
    </div>
  </div>;
}
