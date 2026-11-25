import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { ViewTransition } from "react";
import { allListingPrices, countListings, featuredListings } from "../lib/listings";
import { DdfNotice } from "./ddf-notice";
import { CardPhotos } from "./listing-tools";
import { BudgetRange } from "./editorial-controls";
import HomeSmartSearch from "./home-search";
import { DepthEffects } from "./depth-effects";
import { CountUp } from "./count-up";
import { MobileMenu } from "./mobile-menu";

/* -------------------------------------------------------------------------- */
/*  Content                                                                   */
/* -------------------------------------------------------------------------- */

const F = "/figma-home/";
const PROPERTY_SIZES = "(max-width: 760px) 100vw, 412px";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Search", href: "/search" },
  { label: "Sell", href: "/sell" },
  { label: "Buy", href: "/buy" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/services" },
];

const sampleListings = [
  { price: "$182,900", address: "382, 8948 Elbow Drive SW", area: "Southwest Calgary", beds: 1, baths: 1, sqft: "706", image: "listing-1.png" },
  { price: "$599,900", address: "16 Evansbrooke Rise NW", area: "Northwest Calgary", beds: 4, baths: 4, sqft: "1,631", image: "listing-2.png" },
  { price: "$649,000", address: "64 Edforth Crescent NW", area: "Northwest Calgary", beds: 3, baths: 4, sqft: "1,622", image: "listing-3.png" },
];

const priceTabs = ["All prices", "Under $250,000", "$250,000–$500,000", "$500,000–$750,000", "$750,000+", "Custom range"];

const exclusiveSide = [
  { label: "01 / INTERIORS", title: "Room to unwind.", copy: "Everyday living, beautifully considered.", image: "exclusive-1.png" },
  { label: "02 / OPEN SPACES", title: "Make room for more.", copy: "A fresh perspective on your next address.", image: "exclusive-2.png" },
];

const communities = [
  { name: "Arbour Lake", zone: "NORTHWEST", copy: "Lake-community living", image: "community-1.png" },
  { name: "Aspen Woods", zone: "SOUTHWEST", copy: "West-side neighbourhoods", image: "community-2.png" },
  { name: "Cranston", zone: "SOUTHEAST", copy: "Pathways & open spaces", image: "community-3.png" },
];

const cityZones = ["NW", "NE", "SW", "SE"];
const nearbyCities = ["Airdrie", "Chestermere", "Cochrane"];

const services = [
  { step: "01 —", title: "Sell with a strategy", copy: "Sell fast. Sell smart. Sell for top dollar. From thoughtful pricing to innovative marketing, we guide you from listing to closing.", href: "/sell", image: "service-1.png", cta: "Free Market Evaluation" },
  { step: "02 —", title: "Find your next home", copy: "A guided search built around your budget, neighbourhood and everyday life. Buy with local expertise and peace of mind.", href: "/buy", image: "service-2.png", cta: "Home Buyer Guide" },
  { step: "03 —", title: "Plan your next move", copy: "Considering an investment or a change of address? Get a personal property consultation and a clear plan for what comes next.", href: "/contact", image: "service-3.png", cta: "Talk to our team" },
];

const values = [
  { icon: "why-location.svg", title: "A local perspective", copy: "Understand communities, amenities and the details that make Calgary feel like home." },
  { icon: "why-speaker.svg", title: "Marketing with purpose", copy: "A thoughtful presentation and a personalized strategy designed around your property." },
  { icon: "why-chat.svg", title: "Guidance at every step", copy: "Clear communication from your first conversation to the day you receive the keys." },
];

const articles = [
  { label: "01 / BUYING", title: "How to buy a house in Calgary", copy: "From your first search to the keys in your hand. Start with a clear plan for the journey ahead.", image: "journal-1.png", href: "/buy" },
  { label: "02 / SELLING", title: "Tips to sell a home in Calgary and area", copy: "Thoughtful preparation and a smarter approach to your next move.", image: "journal-2.png", href: "/sell" },
  { label: "03 / FINANCING", title: "How much mortgage can I afford in Calgary?", copy: "Make room for what matters. Get a clearer picture of your home-buying budget.", image: "journal-3.png", href: "/buy#pre-approval" },
];

const footerLinks = [
  { label: "Search homes", href: "/search" },
  { label: "Sell your home", href: "/sell" },
  { label: "Buy a home", href: "/buy" },
  { label: "About ToorAvenues", href: "/about" },
  { label: "Blog", href: "/services" },
  { label: "Home Buyer Guide", href: "/buy" },
  { label: "Mortgage Calculator", href: "/buy#pre-approval" },
];

const count = new Intl.NumberFormat("en-CA");

/* -------------------------------------------------------------------------- */
/*  Shared pieces                                                             */
/* -------------------------------------------------------------------------- */

function Label({ children }: { children: React.ReactNode }) {
  return <p className="ed-label">{children}</p>;
}

function SectionHeading({ label, title, copy }: { label: React.ReactNode; title: React.ReactNode; copy: string }) {
  return (
    <div className="ed-heading">
      <div>
        {typeof label === "string" ? <Label>{label}</Label> : label}
        <h2>{title}</h2>
      </div>
      <p>{copy}</p>
    </div>
  );
}

type PropertyCardProps = {
  photo: React.ReactNode;
  badge: string;
  price: string;
  address: string;
  area: string;
  brokerage?: string | null;
  stats: string[];
  href: string;
  morphId?: string;
};

function PropertyCard({ photo, badge, price, address, area, brokerage, stats, href, morphId }: PropertyCardProps) {
  const image = (
    <div className="ed-property-img">
      {photo}
      <small>{badge}</small>
    </div>
  );
  return (
    <article>
      {/* The photo morphs into the listing page's main photo when you open the home. */}
      {morphId ? <ViewTransition name={`photo-${morphId}`} share="morph" default="none">{image}</ViewTransition> : image}
      <h3>{price}</h3>
      <h4>{address}</h4>
      <p>{area}</p>
      {brokerage && <p>Listed by {brokerage}</p>}
      <div>{stats.map(stat => <span key={stat}>{stat}</span>)}</div>
      <Link href={href}>View home details →</Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */

function Header() {
  return (
    <header className="ed-header ed-shell">
      <Link className="ed-brand" href="/" aria-label="ToorAvenues home">
        <span><Image src={`${F}brand-mark.png`} alt="" fill sizes="76px" /></span>
        <b>ToorAvenues</b>
      </Link>
      <nav aria-label="Main navigation">
        {navLinks.map(({ label, href }) => href === "/"
          ? <Link className="active" href={href} aria-current="page" key={href}>{label}</Link>
          : <Link href={href} key={href}>{label}</Link>)}
      </nav>
      <Link className="ed-pill" href="/contact">Contact us</Link>
      <MobileMenu links={navLinks.map(({ label, href }) => [label, href] as const)} />
    </header>
  );
}

// Live market numbers for the hero (refreshed hourly from the synced DDF® data).
async function heroStats() {
  "use cache";
  cacheLife("hours");
  const total = countListings({}) ?? 0;
  const fresh = countListings({ newOnly: true }) ?? 0;
  const prices = allListingPrices().sort((a, b) => a - b);
  const typical = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  return { total, fresh, typical };
}

const HERO_SLIDES = [
  { src: "why-landscape.png", alt: "Cranston, southeast Calgary" },
  { src: "sunlit-interior.png", alt: "Sunlit modern kitchen and living space" },
  { src: "community-3.png", alt: "Pathways and open space in a Calgary community" },
  { src: "preapproval.png", alt: "Bright kitchen ready for a new chapter" },
];

const HERO_WORDS = [["Sell", "with", "confidence."], ["Buy", "with", "peace", "of", "mind."]];
const ACCENT = new Set(["confidence.", "mind."]);

async function Hero() {
  const stats = await heroStats();
  let word = 0;
  return (
    <section className="cine-hero" aria-labelledby="hero-title">
      <div className="cine-slides" aria-hidden="true">
        {HERO_SLIDES.map((slide, i) => (
          <div className="cine-slide" style={{ "--i": i } as React.CSSProperties} key={slide.src}>
            <Image src={`${F}${slide.src}`} alt="" fill priority={i === 0} sizes="100vw" />
          </div>
        ))}
      </div>
      <div className="cine-shade" aria-hidden="true" />

      <div className="cine-inner ed-shell">
        <p className="cine-kicker"><span className="cine-live" aria-hidden="true" />CALGARY &amp; SURROUNDING AREAS · LIVE MLS® LISTINGS</p>
        <h1 id="hero-title" className="cine-title">
          {HERO_WORDS.map((line, l) => (
            <span className="cine-line" key={l}>
              {line.map(text => <span className={`cine-word${ACCENT.has(text) ? " accent" : ""}`} style={{ "--w": word++ } as React.CSSProperties} key={text}>{text}</span>)}
            </span>
          ))}
        </h1>
        <p className="cine-lead">A place to belong. A team on your side. Your next chapter starts with local guidance that puts you first.</p>
        <div className="cine-actions">
          <Link className="cine-btn primary" href="/contact?interest=home-value">Free Market Evaluation</Link>
          <Link className="cine-btn ghost" href="/search#listing-results">Explore {stats.total ? stats.total.toLocaleString("en-CA") : ""} homes <span aria-hidden="true">→</span></Link>
        </div>
        {stats.total > 0 && <dl className="cine-stats">
          <div><dt>Homes for sale now</dt><dd><CountUp value={stats.total} /></dd></div>
          <div><dt>New in the last 7 days</dt><dd><CountUp value={stats.fresh} /></dd></div>
          <div><dt>Typical asking price</dt><dd><CountUp value={Math.round(stats.typical / 1000)} prefix="$" suffix="K" /></dd></div>
        </dl>}
      </div>

      <div className="cine-search"><HomeSmartSearch variant="hero" /></div>
      <small className="cine-credit">TOOR — Team of Outstanding REALTORS®</small>
    </section>
  );
}

// Newest Calgary listings from the synced DDF® database. Cached and refreshed every
// minute, so new syncs (and removals) appear without a rebuild. Falls back to
// illustrative examples when the database has no listings yet.
async function FeaturedHomes() {
  "use cache";
  cacheLife("minutes");
  const live = featuredListings(3);

  if (!live.length) {
    return (
      <>
        <div className="ed-property-grid">
          {sampleListings.map(home => (
            <PropertyCard
              key={home.address}
              photo={<Image src={`${F}${home.image}`} alt={`Illustrative photo for ${home.address}`} fill sizes={PROPERTY_SIZES} />}
              badge="Illustrative photo"
              price={home.price}
              address={home.address}
              area={home.area}
              stats={[`${home.beds} bed`, `${home.baths} bath`, `${home.sqft} sqft`]}
              href="/search"
            />
          ))}
        </div>
        <p className="ed-disclaimer">Illustrative listing examples from the ToorAvenues Calgary archive. Prices and availability are subject to change. Photos are for inspiration and are not photographs of the listed properties.</p>
      </>
    );
  }

  return (
    <>
      <div className="ed-property-grid">
        {live.map(home => (
          <PropertyCard
            key={home.id}
            photo={home.photo && <CardPhotos listingKey={home.id} photo={home.photo} count={home.photoCount} alt={`Photo of ${home.address}`} sizes={PROPERTY_SIZES} />}
            badge={home.badge ?? `MLS® ${home.mls}`}
            price={home.priceLabel}
            address={home.address}
            area={home.area}
            brokerage={home.brokerage}
            stats={[`${home.beds ?? "–"} bed`, `${home.baths ?? "–"} bath`, home.sqft ? `${count.format(home.sqft)} sqft` : "– sqft"]}
            href={`/listing/${home.slug}`}
            morphId={home.id}
          />
        ))}
      </div>
      <DdfNotice className="ed-disclaimer" />
    </>
  );
}

function Listings() {
  return (
    <section className="ed-section ed-listings ed-shell" id="homes">
      <SectionHeading label="CALGARY HOMES" title="Explore Calgary homes. Imagine what’s next." copy="From a first address to a little more room, discover possibilities across the city." />
      <div className="ed-price-tabs">
        {priceTabs.map((tab, i) => {
          const isCustom = i === priceTabs.length - 1;
          // Price tabs open matching results; "Custom range" jumps to the budget picker below.
          const href = isCustom ? "#budget" : i === 0 ? "/search#listing-results" : `/search?price=${encodeURIComponent(tab)}#listing-results`;
          return <Link className={isCustom ? "active" : ""} href={href} key={tab}>{tab}</Link>;
        })}
      </div>
      <BudgetRange />
      <FeaturedHomes />
    </section>
  );
}

function ExclusiveProperties() {
  return (
    <section className="ed-section ed-exclusive ed-shell">
      <SectionHeading label="EXCLUSIVE PROPERTIES" title={<>Distinctive homes.<br />An exceptional next chapter.</>} copy="A more personal way to discover your next home. Connect with our team for private introductions and current availability." />
      <div className="ed-exclusive-grid">
        <article className="feature">
          <div>
            <Image src={`${F}exclusive-main.png`} alt="Architectural living" fill sizes="760px" />
            <small>THE SPOTLIGHT</small>
          </div>
          <h3>Architectural living</h3>
          <p>Considered design. Space to make your own.</p>
          <Link href="/contact">Request a private introduction →</Link>
        </article>
        <div className="side">
          {exclusiveSide.map(item => (
            <article key={item.label}>
              <div><Image src={`${F}${item.image}`} alt="" fill sizes="220px" /></div>
              <section>
                <small>{item.label}</small>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <Link href="/contact">Enquire now →</Link>
              </section>
            </article>
          ))}
        </div>
      </div>
      <p className="ed-disclaimer">Illustrative property previews. Contact ToorAvenues for current exclusive listings and availability.</p>
    </section>
  );
}

function About() {
  return (
    <section className="ed-section ed-about ed-shell">
      <div>
        <Label>ABOUT US</Label>
        <h2>Local knowledge. Real relationships. Your trusted partner.</h2>
        <p className="lead">ToorAvenues — where your goals become our mission.</p>
        <p>We believe real estate is more than just buying and selling — it’s about building relationships, creating opportunities, and turning dreams into addresses.</p>
        <h3>Turning dreams into addresses.</h3>
        <p>Personalized guidance. Thoughtful decisions. A place that feels like you.</p>
        <Link href="/about">Get to know ToorAvenues</Link>
      </div>
      <div className="ed-founder">
        <div><Image src={`${F}about-portrait.png`} alt="Davinder Toor" fill sizes="382px" /></div>
        <section>
          <h3>Davinder Toor</h3>
          <p>Founder &amp; REALTOR® EXP REALTY</p>
          <a href="tel:+14039264000">403-926-4000</a>
          <Image src={`${F}about-exp.png`} alt="eXp Realty" width={96} height={63} />
        </section>
        <small>TOOR — Team of Outstanding REALTORS®</small>
      </div>
    </section>
  );
}

function Communities() {
  return (
    <section className="ed-section ed-communities ed-shell">
      <SectionHeading label="OUR COMMUNITIES" title="Find your kind of Calgary." copy="Lakeside weekends, family-friendly neighbourhoods or a home close to downtown. Explore the places that fit the way you live." />
      <div className="ed-community-grid">
        {communities.map((c, i) => (
          <article className={`c${i + 1}`} key={c.name}>
            <div><Image src={`${F}${c.image}`} alt={`${c.name}, Calgary`} fill sizes="412px" /></div>
            <small>{c.zone}</small>
            <h3><Link href={`/search?query=${encodeURIComponent(c.name)}`}>{c.name}</Link></h3>
            <p>{c.copy}</p>
          </article>
        ))}
      </div>
      <div className="ed-community-links">
        <div>
          {cityZones.map(zone => <Link href={`/search?city=Calgary&zone=${zone}`} key={zone}>Calgary {zone}</Link>)}
        </div>
        <div>
          <span>Beyond the city</span>
          {nearbyCities.map(city => <Link href={`/search?city=${city}`} key={city}>{city} →</Link>)}
        </div>
      </div>
      <Link className="ed-text-link" href="/search">Explore all communities</Link>
    </section>
  );
}

function Services() {
  return (
    <section className="ed-section ed-services ed-shell">
      <SectionHeading label="OUR SERVICES" title="Every move deserves a personal approach." copy="Exceptional service, innovative marketing and a commitment to your goals. One team for every stage of your real estate journey." />
      <div className="ed-service-list">
        {services.map(s => (
          <article key={s.step}>
            <span>{s.step}</span>
            <h3>{s.title}</h3>
            <div>
              <p>{s.copy}</p>
              <Link href={s.href}>{s.cta}</Link>
            </div>
            <div className="photo"><Image src={`${F}${s.image}`} alt="" fill sizes="250px" /></div>
          </article>
        ))}
      </div>
      <Link className="ed-text-link" href="/contact">Let&apos;s talk about your goals</Link>
    </section>
  );
}

function WhyChooseUs() {
  return (
    <section className="ed-why">
      <div className="ed-shell">
        <SectionHeading label={<p className="ed-chip"><i aria-hidden="true" />WHY CHOOSE US?</p>} title="Your goals. Our commitment." copy="Not a one-size-fits-all process. We take time to understand your priorities and help you move forward with confidence." />
        <div className="ed-landscape">
          <Image src={`${F}why-landscape.png`} alt="Cranston, Calgary landscape" fill sizes="1360px" />
          <div className="shade" />
          <aside>
            <h3>Local insight. Better decisions.</h3>
            <p>From your ideal community to your next property investment, get advice that starts with what matters to you.</p>
          </aside>
          <section>
            <h2>Rooted in Calgary. Focused on you.</h2>
            <Link href="/contact">
              <span><Image src={`${F}why-arrow.svg`} alt="" width={20} height={20} /></span>
              Plan your move with us
            </Link>
          </section>
          <small>Cranston, southeast Calgary</small>
        </div>
        <div className="ed-values">
          {values.map(v => (
            <article key={v.title}>
              <h3><span><Image src={`${F}${v.icon}`} alt="" width={24} height={24} /></span>{v.title}</h3>
              <p>{v.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreApproval() {
  return (
    <section className="ed-section ed-preapproval ed-shell">
      <div>
        <div className="photo"><Image src={`${F}preapproval.png`} alt="Kitchen for the next chapter" fill sizes="628px" /></div>
        <small>Make room for your next chapter.</small>
      </div>
      <div>
        <Label>GET PRE-APPROVED</Label>
        <h2>A stronger start to your home search.</h2>
        <p>Know your budget. Strengthen your offer. Move sooner. We’ll connect you with trusted lenders so you can take the next step.</p>
        <Link className="ed-pill" href="/buy#pre-approval">Get Started Now</Link>
        <Link className="ed-text-link" href="/buy#pre-approval">Explore the Mortgage Calculator →</Link>
      </div>
    </section>
  );
}

function Journal() {
  return (
    <section className="ed-section ed-journal ed-shell">
      <div className="ed-journal-head">
        <div>
          <Label>THE TOORAVENUES JOURNAL</Label>
          <h2>Good moves start<br />with fresh thinking.</h2>
        </div>
        <div>
          <small>INSIGHT / IDEAS / YOUR NEXT MOVE</small>
          <p>A clearer perspective on buying, selling and making Calgary feel like home.</p>
          <Link href="/services">Explore the blog →</Link>
        </div>
      </div>
      <div className="ed-articles">
        {articles.map((a, i) => (
          <article className={i === 0 ? "featured" : ""} key={a.label}>
            <Label>{a.label}</Label>
            <div><Image src={`${F}${a.image}`} alt="" fill sizes={i === 0 ? "628px" : "304px"} /></div>
            <small>THE PRACTICAL GUIDE</small>
            <h3>{a.title}</h3>
            <p>{a.copy}</p>
            <Link href={a.href}>Read the guide <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function ListingUpdates() {
  return (
    <section className="ed-updates ed-shell" id="updates">
      <div>
        <h2>A new home on your radar.</h2>
        <p>Get Calgary listing updates tailored to your search.</p>
      </div>
      <form action="/contact">
        <div>
          <input type="email" name="email" required autoComplete="email" aria-label="Email address" placeholder="Your email address" />
          <button type="submit">Get listing updates</button>
        </div>
        <small>By signing up, you agree to receive property updates. Unsubscribe anytime.</small>
      </form>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ed-footer">
      <div className="ed-shell">
        <div className="ed-footer-top">
          <b>ToorAvenues</b>
          <h2>There’s an avenue for every dream.</h2>
        </div>
        <div className="ed-footer-grid">
          <section>
            <h3>Your next chapter. Our shared mission.</h3>
            <p>Team of Outstanding REALTORS®. Helping you sell with confidence and buy with peace of mind.</p>
            <Link className="ed-pill yellow" href="/contact">Let’s connect</Link>
          </section>
          <section aria-label="Explore">
            <b>EXPLORE</b>
            {footerLinks.map(({ label, href }) => <Link href={href} key={label}>{label}</Link>)}
          </section>
          <section>
            <b>VISIT OR GET IN TOUCH</b>
            <address>
              <p>#700 - 1816 Crowchild Trail NW<br />Calgary, AB T2M 3Y7</p>
            </address>
            <a href="mailto:info@tooravenues.com">info@tooravenues.com</a>
            <p>Monday–Friday<br />9:00 AM–6:00 PM</p>
          </section>
          <section>
            <b>YOUR LOCAL TEAM</b>
            <h3>Davinder Toor</h3>
            <small>Founder &amp; REALTOR® · EXP REALTY</small>
            <div className="ed-agent-phone">
              <Image src={`${F}footer-exp.png`} alt="eXp Realty" width={70} height={36} />
              <a href="tel:+14039264000">403-926-4000</a>
            </div>
            <small>davindersinghtoor@gmail.com</small>
            <h3>Eknoor Toor</h3>
            <small>REALTOR® · LPT Realty</small>
            <a href="tel:+14039261122">403-926-1122</a>
            <small>eknoorktoor@gmail.com</small>
          </section>
        </div>
        <div className="ed-legal">
          <span>© 2026 ToorAvenues. All rights reserved.</span>
          <span>
            <Link href="/privacy-policy">Privacy policy</Link> &nbsp; · &nbsp;
            <a href="https://www.facebook.com/ToorAvenues/" target="_blank" rel="noopener noreferrer">Facebook</a> &nbsp; · &nbsp;
            <a href="https://www.instagram.com/tooravenues/" target="_blank" rel="noopener noreferrer">Instagram</a>
          </span>
        </div>
        <p className="ed-team-notice">Davinder Toor, REALTOR®, is registered with eXp Realty. Eknoor Toor, REALTOR®, is registered with LPT Realty. ToorAvenues is a team name and not a brokerage.</p>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
    <div className="editorial-home">
      <Header />
      <main>
        <Hero />
        <Listings />
        <ExclusiveProperties />
        <About />
        <Communities />
        <Services />
        <WhyChooseUs />
        <PreApproval />
        <Journal />
        <ListingUpdates />
      </main>
      <Footer />
      <DepthEffects />
    </div>
    </ViewTransition>
  );
}
