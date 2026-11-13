"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const A = "/assets/";

type Listing = {
  id: string;
  price: number;
  address: string;
  area: string;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  mls: string;
  days: number;
};

const listings: Listing[] = [
  { id: "whitehorn", price: 429900, address: "83 Whitworth Way NE", area: "Whitehorn · Calgary, AB", beds: 3, baths: 2, sqft: 872, type: "Duplex", mls: "A2333036", days: 1 },
  { id: "bridlewood", price: 724900, address: "101 Bridlewood Street", area: "Bridlewood · Calgary, AB", beds: 3, baths: 3, sqft: 1383, type: "Single family", mls: "CREA DDF®", days: 2 },
  { id: "legacy", price: 989900, address: "408 Legacy Circle SE", area: "Legacy · Calgary, AB", beds: 5, baths: 4, sqft: 2500, type: "Detached", mls: "CREA DDF®", days: 3 },
];

type CustomSelectProps = {
  label: string;
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
};

function escapeOption(option: string) {
  return option.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function CustomSelect({ label, options, value, onChange }: CustomSelectProps) {
  const [internalValue, setInternalValue] = useState(options[0]);
  const wrapper = useRef<HTMLDetailsElement>(null);
  const fieldId = useId().replaceAll(":", "");
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
    {options.map((option, index) => <input className="custom-select-radio" type="radio" name={`select-${fieldId}`} id={`${fieldId}-${index}`} value={option} defaultChecked={selected === option} onChange={() => choose(option)} key={option} />)}
    <summary className="custom-select-trigger" aria-label={label} onClick={event => closeOtherMenus(event.currentTarget.parentElement as HTMLDetailsElement)}><span className="custom-select-values">{options.map(option => <span key={option}>{option}</span>)}</span><span className="select-chevron"><Image src={`${A}chevron.svg`} alt="" width={12} height={12} /></span></summary>
    <div className="custom-select-menu" role="listbox" aria-label={label}>{options.map((option, index) => <label role="option" aria-selected={selected === option} htmlFor={`${fieldId}-${index}`} key={option}><span className="custom-select-option-content" dangerouslySetInnerHTML={{ __html: `<span onclick="const menu=this.closest('details');setTimeout(()=>menu.open=false,0)">${escapeOption(option)}</span>` }} /></label>)}</div>
  </details>;
}

export function PropertySearch() {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("3 matching sample homes found below. Connect an IDX feed for live Calgary results.");
    document.querySelector("#listings")?.scrollIntoView({ behavior: "smooth" });
  }

  return <form className={`property-search shell ${expanded ? "is-expanded" : ""}`} onSubmit={submitSearch}>
    <div className="search-top"><h2>Start your Calgary real estate search</h2><div><b>Homes for sale</b><a href="#listing-results">Map view →</a></div></div>
    <div className="search-fields">
      <div className="search-field"><span>CITY</span><CustomSelect label="City" options={["Calgary", "Airdrie", "Cochrane"]} /></div>
      <label><span>COMMUNITY OR ADDRESS</span><input aria-label="Community or address" placeholder="All communities" /></label>
      <div className="search-field"><span>PRICE RANGE</span><CustomSelect label="Price range" options={["Any price", "Under $500K", "$500K–$750K", "$750K–$1M", "$1M+"]} /></div>
      <div className="search-field"><span>BEDS</span><CustomSelect label="Beds" options={["Any", "2+", "3+", "4+"]} /></div>
      <div className="search-field"><span>BATHS</span><CustomSelect label="Baths" options={["Any", "2+", "3+"]} /></div>
      <button className="button green" type="submit">Search homes</button>
    </div>
    {expanded && <div className="advanced-fields">
      <div className="search-field"><span>PROPERTY TYPE</span><CustomSelect label="Property type" options={["All types", "Detached", "Townhouse", "Condo"]} /></div>
      <label><span>MINIMUM SQ. FT.</span><input type="number" placeholder="Any" min="0" /></label>
      <div className="search-field"><span>YEAR BUILT</span><CustomSelect label="Year built" options={["Any year", "2020 or newer", "2010 or newer", "2000 or newer"]} /></div>
      <label className="check-field"><input type="checkbox" /> Open houses only</label>
      <label className="check-field"><input type="checkbox" /> New listings only</label>
    </div>}
    <div className="search-bottom"><button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer filters −" : "More filters +"}</button><span>♡ Save this search for new listing alerts</span></div>
    {message && <p className="search-message" role="status">{message}</p>}
  </form>;
}

export function PropertyExplorer() {
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState("featured");
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem("toor-saved-homes");
      if (stored) setSaved(JSON.parse(stored) as string[]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const sorted = useMemo(() => [...listings].sort((a, b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : a.days - b.days), [sort]);

  function toggleSaved(id: string) {
    setSaved(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      window.localStorage.setItem("toor-saved-homes", JSON.stringify(next));
      return next;
    });
  }

  return <div id="listing-results">
    <div className="results-toolbar"><div><strong>{listings.length} featured homes</strong><span>{saved.length} saved</span></div><div className="view-switch"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map</button><CustomSelect label="Sort listings" value={sort === "featured" ? "Newest first" : sort === "low" ? "Price: low to high" : "Price: high to low"} options={["Newest first", "Price: low to high", "Price: high to low"]} onChange={option => setSort(option === "Newest first" ? "featured" : option === "Price: low to high" ? "low" : "high")} /></div></div>
    {view === "map" ? <div className="property-map" role="img" aria-label="Sample Calgary property map"><div className="map-road road-one" /><div className="map-road road-two" />{sorted.map((listing, index) => <button key={listing.id} style={{ left:`${20 + index * 28}%`, top:`${25 + (index % 2) * 38}%` }} onClick={() => setSelected(listing)}>${Math.round(listing.price / 1000)}K</button>)}<p>Interactive preview · Connect a maps provider and IDX feed for live results</p></div> : <div className="listing-grid">{sorted.map((item, i) => <article className="property" key={item.id}>
      <div className={`property-img crop-${i}`}><Image src={`${A}property.png`} alt="Modern Calgary property" fill sizes="(max-width: 760px) 100vw, 282px" /><button className={saved.includes(item.id) ? "saved" : ""} aria-label={saved.includes(item.id) ? "Remove saved listing" : "Save listing"} onClick={() => toggleSaved(item.id)}><Image src={`${A}heart.svg`} alt="" width={18} height={18} /></button><small>{item.days === 1 ? "NEW LISTING" : "ILLUSTRATIVE PHOTO"}</small></div>
      <h3>${item.price.toLocaleString()}</h3><h4>{item.address}</h4><p>{item.area} · {item.mls === "CREA DDF®" ? item.mls : `MLS® ${item.mls}`}</p><hr /><div className="features"><span>⌂ {item.beds} Beds</span><span>◌ {item.baths} Baths</span><span>{item.sqft.toLocaleString()} ft²</span></div><button className="listing-detail-link" onClick={() => setSelected(item)}>View details →</button>
    </article>)}</div>}
    {selected && <div className="listing-modal" role="dialog" aria-modal="true" aria-label="Property details" onMouseDown={() => setSelected(null)}><article onMouseDown={event => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><div className="modal-image"><Image src={`${A}property.png`} alt="Illustrative Calgary home interior" fill sizes="600px" /></div><small>{selected.type} · {selected.mls === "CREA DDF®" ? selected.mls : `MLS® ${selected.mls}`}</small><h2>{selected.address}</h2><h3>${selected.price.toLocaleString()}</h3><p>{selected.beds} beds · {selected.baths} baths · {selected.sqft.toLocaleString()} ft² · Active listing</p><p>This property information comes from the ToorAvenues listing feed. The photograph is illustrative; confirm current availability, property details, listing imagery, and brokerage attribution before publication.</p><a className="button green" href="#contact">Request a private showing</a></article></div>}
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
