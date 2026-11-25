import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { listingByMls, mlsFromSlug, similarListings, type Listing, type ListingDetail } from "../../../lib/listings";
import { DdfNotice } from "../../ddf-notice";
import Image from "next/image";
import { ListingViewEvent } from "../../listing-gallery";
import { ListingActions, ListingMosaic, StickyListingBar } from "../../listing-showcase";
import { ListingLocationMap } from "../../listing-location-map";
import { CardPhotos, MortgageCalculator } from "../../listing-tools";
import { InnerPage } from "../../site-components";

// Same URL scheme as the previous site (/listing/14-radcliffe-crescent-se-calgary-a2359747),
// so indexed pages and shared links keep working. Cached per listing and revalidated
// every minute, so syncs (including removals) show up quickly.
async function getListing(slug: string) {
  "use cache";
  cacheLife("minutes");
  const mls = mlsFromSlug(slug);
  if (!mls) return null;
  const listing = await listingByMls(mls);
  return listing ? { listing, similar: await similarListings(listing, 8) } : null;
}

/** Monthly mortgage payment with the calculator's defaults: 20% down, 4.5%, 25 years, Canadian semi-annual compounding. */
function estimatePayment(price: number) {
  const principal = price * 0.8;
  const rate = Math.pow(1 + 0.045 / 2, 1 / 6) - 1;
  const months = 25 * 12;
  return Math.round(principal * rate / (1 - Math.pow(1 + rate, -months)));
}

const factIcon = (path: React.ReactNode) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;

const shortPrice = (price: number) => price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : `$${Math.round(price / 1000)}K`;

export async function generateMetadata({ params }: PageProps<"/listing/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getListing(slug);
  if (!result) return { title: "Listing no longer available | ToorAvenues", robots: { index: false } };
  const { listing } = result;
  const city = listing.city ?? "Canada";
  const beds = listing.beds ? `${listing.beds} Bed ` : "";
  const title = `${listing.showAddress ? `${listing.address}, ${city}` : `Home for sale in ${city}`} | ${beds}${listing.type} for Sale ${shortPrice(listing.price)}`;
  const description = [
    `${[listing.beds && `${listing.beds} bed`, listing.baths && `${listing.baths} bath`].filter(Boolean).join(", ")} ${listing.type.toLowerCase()} for sale`,
    listing.showAddress ? `at ${listing.address}${listing.community ? ` in ${listing.community}` : ""}, ${city}.` : `in ${city}.`,
    listing.sqft ? `${listing.sqft.toLocaleString("en-CA")} sq ft.` : "",
    `Listed at ${listing.priceLabel}. MLS® ${listing.mls}.`,
  ].filter(Boolean).join(" ");
  return {
    title,
    description,
    alternates: { canonical: `/listing/${listing.slug}` },
    openGraph: { title, description, url: `/listing/${listing.slug}`, type: "website", images: listing.photos[0] ? [{ url: listing.photos[0] }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: listing.photos[0] ? [listing.photos[0]] : undefined },
  };
}

function structuredData(listing: ListingDetail) {
  const site = process.env.SITE_URL || "https://tooravenues.com";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.showAddress ? `${listing.address}, ${listing.city ?? ""}`.trim() : `Home for sale in ${listing.city ?? "Canada"}`,
    url: `${site}/listing/${listing.slug}`,
    datePosted: listing.listedAt ?? undefined,
    dateModified: listing.modifiedAt ?? undefined,
    image: listing.photos.slice(0, 6),
    description: listing.remarks?.slice(0, 500) ?? undefined,
    offers: { "@type": "Offer", price: listing.price, priceCurrency: "CAD", availability: "https://schema.org/InStock" },
    about: {
      "@type": listing.type === "Apartment" ? "Apartment" : "SingleFamilyResidence",
      numberOfRooms: listing.beds ?? undefined,
      numberOfBathroomsTotal: listing.baths ?? undefined,
      floorSize: listing.sqft ? { "@type": "QuantitativeValue", value: listing.sqft, unitCode: "FTK" } : undefined,
      yearBuilt: listing.yearBuilt ?? undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: listing.showAddress ? listing.address : undefined,
        addressLocality: listing.city ?? undefined,
        addressRegion: "AB",
        postalCode: listing.postalCode ?? undefined,
        addressCountry: "CA",
      },
      geo: listing.latitude !== null && listing.longitude !== null ? { "@type": "GeoCoordinates", latitude: listing.latitude, longitude: listing.longitude } : undefined,
    },
  };
}

function SimilarCard({ home }: { home: Listing }) {
  return <article className="property">
    <ViewTransition name={`photo-${home.id}`} share="morph" default="none">
      <Link href={`/listing/${home.slug}`} className="property-img" aria-label={`${home.address}, ${home.priceLabel}`}>
        {home.photo && <CardPhotos listingKey={home.id} photo={home.photo} count={home.photoCount} alt={`Photo of ${home.address}`} sizes="(max-width: 760px) 100vw, 360px" />}
        {home.badge && <small>{home.badge.toUpperCase()}</small>}
      </Link>
    </ViewTransition>
    <h3>{home.priceLabel}</h3><h4><Link href={`/listing/${home.slug}`}>{home.address}</Link></h4><p>{home.area} · {home.type} · MLS® {home.mls}</p>{home.brokerage && <p>Listed by {home.brokerage}</p>}
    <hr /><div className="features"><span>⌂ {home.beds ?? "–"} Beds</span><span>◌ {home.baths ?? "–"} Baths</span><span>{home.sqft ? `${home.sqft.toLocaleString("en-CA")} ft²` : "– ft²"}</span></div>
  </article>;
}

async function ListingContent({ params }: { params: PageProps<"/listing/[slug]">["params"] }) {
  const { slug } = await params;
  const result = await getListing(slug);
  if (!result) notFound();
  const { listing, similar } = result;
  if (slug.toLowerCase().replace(/\/+$/, "") !== listing.slug) permanentRedirect(`/listing/${listing.slug}`);
  const mapUrl = listing.showAddress && listing.latitude !== null && listing.longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${listing.latitude}%2C${listing.longitude}` : null;
  const showingHref = `/contact?interest=showing&listing=${encodeURIComponent(listing.mls)}`;
  const payment = `Est. $${estimatePayment(listing.price).toLocaleString("en-CA")}/mo`;
  const facts = [
    listing.beds !== null && { icon: <><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 14h18M3 18v2M21 18v2" /><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /></>, value: String(listing.beds), label: listing.beds === 1 ? "Bedroom" : "Bedrooms" },
    listing.baths !== null && { icon: <><path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M6 12V6a2 2 0 0 1 3.5-1.3M6 20l-1 2M18 20l1 2" /></>, value: String(listing.baths), label: listing.baths === 1 ? "Bathroom" : "Bathrooms" },
    listing.sqft && { icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h6V3M15 21v-6h6" /></>, value: listing.sqft.toLocaleString("en-CA"), label: "Sq ft" },
    listing.yearBuilt && { icon: <><path d="M3 21h18M5 21V9l7-5 7 5v12" /><path d="M10 21v-5h4v5" /></>, value: String(listing.yearBuilt), label: "Year built" },
    { icon: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>, value: listing.type, label: "Property type" },
    { icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, value: listing.days <= 0 ? "New" : String(listing.days), label: listing.days <= 0 ? "Listed today" : listing.days === 1 ? "Day on market" : "Days on market" },
  ].filter(Boolean) as { icon: React.ReactNode; value: string; label: string }[];

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(listing)).replace(/</g, "\\u003c") }} />
    <section className="listing-page-head">
      <Link className="listing-back" href="/search">← Back to search</Link>
      <div className="listing-page-title">
        <div><p className="section-label">{listing.type.toUpperCase()} · MLS® {listing.mls} · LISTED {listing.ageLabel.toUpperCase()}</p><h1>{listing.address}</h1><span>{listing.area}</span></div>
        <div className="listing-price-block">
          <strong>{listing.priceLabel}</strong>
          <a className="listing-payment" href="#mortgage-calculator">{payment} <span>· calculate →</span></a>
          <ListingActions id={listing.id} title={`${listing.address} · ${listing.priceLabel}`} />
        </div>
      </div>
      {listing.openHouses.length > 0 && <div className="listing-open-houses"><b>Open house</b>{listing.openHouses.map(item => <span key={item}>{item}</span>)}</div>}
    </section>
    {listing.photos.length ? <ListingMosaic photos={listing.photos} alt={listing.address} morphId={listing.id} /> : <p className="listing-no-photos">Photos are not available for this listing.</p>}
    <dl className="listing-keyfacts">
      {facts.map(fact => <div key={fact.label}><span>{factIcon(fact.icon)}</span><dd>{fact.value}</dd><dt>{fact.label}</dt></div>)}
    </dl>
    <section className="listing-page-body">
      <div>
        {listing.remarks && <><h2>About this home</h2><p className="listing-remarks">{listing.remarks}</p></>}
        {listing.groups.map(group => <section className="listing-fact-group" key={group.title}>
          <h2>{group.title}</h2>
          <dl className="listing-facts">{group.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section>)}
        {listing.rooms.length > 0 && <section className="listing-fact-group">
          <h2>Rooms</h2>
          <div className="listing-rooms"><table><thead><tr><th>Room</th><th>Level</th><th>Size</th></tr></thead>
            <tbody>{listing.rooms.map((room, index) => <tr key={`${room.type}-${index}`}><td>{room.type}</td><td>{room.level}</td><td>{room.size}</td></tr>)}</tbody></table></div>
        </section>}
        {listing.showAddress && listing.latitude !== null && listing.longitude !== null && <section className="listing-fact-group listing-location">
          <h2>Location</h2>
          <p>{listing.address}{listing.community ? ` · ${listing.community}` : ""}{listing.city ? ` · ${listing.city}` : ""}</p>
          <ListingLocationMap lat={listing.latitude} lng={listing.longitude} label={shortPrice(listing.price)} />
          {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps for directions →</a>}
        </section>}
        <MortgageCalculator price={listing.price} annualTax={listing.annualTax} monthlyFee={listing.monthlyFee} />
      </div>
      <aside className="listing-aside">
        <div className="listing-agent">
          <span><Image src="/figma-home/about-portrait.png" alt="Davinder Toor" fill sizes="64px" /></span>
          <div><b>Davinder Toor</b><small>Founder &amp; REALTOR® · eXp Realty</small></div>
        </div>
        <b>Interested in this home?</b>
        <p>Book a private showing or ask the ToorAvenues team about this property and the neighbourhood.</p>
        <Link className="button green" href={showingHref}>Request info or a showing</Link>
        <a href="tel:4039264000">Call Davinder · 403-926-4000</a>
        <a href={`mailto:info@tooravenues.com?subject=${encodeURIComponent(`MLS® ${listing.mls} – ${listing.address}`)}`}>Email info@tooravenues.com</a>
        <a href="tel:4039261122">Call Eknoor · 403-926-1122</a>
        <a href="#mortgage-calculator">Estimate your payment</a>
        {mapUrl && <a href={mapUrl} target="_blank" rel="noopener">View on Google Maps →</a>}
        <hr />
        {listing.brokerage && <p>Listing courtesy of <strong>{listing.brokerage}</strong>.</p>}
        {listing.listingUrl && <a href={listing.listingUrl} target="_blank" rel="noopener">View this listing on REALTOR.ca →</a>}
      </aside>
    </section>
    {similar.length > 0 && <section className="listing-similar">
      <div className="listing-similar-head"><h2>More homes for sale in {listing.community ?? listing.city}</h2><Link href={`/search?query=${encodeURIComponent(listing.community ?? listing.city ?? "")}#listing-results`}>View all homes →</Link></div>
      <div className="similar-rail" tabIndex={0} aria-label="Similar homes, scroll sideways">{similar.map(home => <SimilarCard home={home} key={home.id} />)}</div>
    </section>}
    <ListingViewEvent listingKey={listing.id} />
    <StickyListingBar price={listing.priceLabel} payment={payment} address={listing.address} showingHref={showingHref} photo={listing.photos[0]} />
  </>;
}

export default function ListingPage({ params }: PageProps<"/listing/[slug]">) {
  return <InnerPage><div className="listing-page shell">
    <Suspense fallback={<div className="listing-page-loading" aria-busy="true">Loading listing…</div>}>
      <ListingContent params={params} />
    </Suspense>
    <DdfNotice />
  </div></InnerPage>;
}
