import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { countListings, marketStats } from "../../lib/listings";
import { TYPE_CHOICES } from "../../lib/search-options";
import { AffordabilityCalculator, ClosingCostEstimator } from "../market-tools";
import { Faq, MarketStrip, SectionHead, Timeline, icons, type TimelineStep } from "../market-sections";
import { InnerCta, InnerPage, PageHero } from "../site-components";

export const metadata: Metadata = {
  title: "Buy a Home in Calgary | Affordability Calculator | ToorAvenues",
  description: "Find out how much home you can afford, estimate Alberta closing costs, browse Calgary homes by budget and type, and buy with ToorAvenues.",
};

const BUDGETS = [
  { label: "Under $400K", copy: "Condos & starter townhomes", min: 0, max: 400_000 },
  { label: "$400K – $600K", copy: "Townhomes, duplexes & first houses", min: 400_000, max: 600_000 },
  { label: "$600K – $800K", copy: "Family homes across the city", min: 600_000, max: 800_000 },
  { label: "$800K – $1M", copy: "Larger homes & established areas", min: 800_000, max: 1_000_000 },
  { label: "$1M +", copy: "Luxury, estate & inner-city infills", min: 1_000_000, max: 0 },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  house: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  semi: <><path d="M2 11 7 6l5 5 5-5 5 5" /><path d="M4 10v10h16V10" /><path d="M12 11v9" /></>,
  town: <><path d="M3 20V9l4-4 4 4 4-4 4 4v11" /><path d="M3 20h18M11 9v11M15 9v11" /></>,
  condo: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  bungalow: <><path d="M2 12 12 6l10 6" /><path d="M4 11v9h16v-9" /></>,
  multi: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18" /></>,
  mobile: <><rect x="2" y="8" width="20" height="9" rx="2" /><path d="M6 17v2M18 17v2" /></>,
  land: <><path d="M12 21v-6" /><circle cx="12" cy="9" r="5" /><path d="M4 21h16" /></>,
};

// Live counts for the page, refreshed hourly from the synced MLS® listings.
async function buyData() {
  "use cache";
  cacheLife("hours");
  const [stats, budgets, types] = await Promise.all([
    marketStats(),
    Promise.all(BUDGETS.map(async band => await countListings({ minPrice: band.min || undefined, maxPrice: band.max || undefined }) ?? 0)),
    Promise.all(TYPE_CHOICES.map(async choice => await countListings({ type: choice.value }) ?? 0)),
  ]);
  return { stats, budgets, types };
}

const count = new Intl.NumberFormat("en-CA");

const steps: TimelineStep[] = [
  { title: "Define your goals", time: "Day 1", copy: "Must-haves, nice-to-haves, commute, schools and the lifestyle you want next.", icon: icons.home },
  { title: "Get pre-approved", time: "Week 1", copy: "Know your real budget and lock in a rate so you can act quickly.", icon: icons.wallet },
  { title: "Search smarter", time: "Ongoing", copy: "Instant alerts for new listings that match, plus off-market introductions.", icon: icons.search },
  { title: "Tour & compare", time: "Weekends", copy: "Guided showings with honest notes on condition, value and resale.", icon: icons.users },
  { title: "Offer & negotiate", time: "1–3 days", copy: "Pricing backed by comparable sales and terms that protect you.", icon: icons.chat },
  { title: "Inspection & conditions", time: "5–10 days", copy: "Inspection, financing and condo documents reviewed before you commit.", icon: icons.doc },
  { title: "Close & move in", time: "30–60 days", copy: "Lawyer, lender and possession day coordinated — then the keys are yours.", icon: icons.key },
];

const programs: [React.ReactNode, string, string, string][] = [
  [icons.piggy, "First Home Savings Account (FHSA)", "Save up to $8,000 a year ($40,000 lifetime). Contributions are tax-deductible and withdrawals for your first home are tax-free.", "Up to $40,000"],
  [icons.wallet, "RRSP Home Buyers' Plan", "Borrow from your RRSP for a down payment and repay it over 15 years. Couples can each use it.", "Up to $60,000 each"],
  [icons.doc, "First-Time Home Buyers' Tax Credit", "A $10,000 non-refundable credit claimed on your tax return in the year you buy — worth $1,500.", "$1,500 back"],
  [icons.shield, "30-year insured mortgages", "First-time buyers can amortize insured mortgages over 30 years for a lower monthly payment.", "Lower payments"],
];

const faq: [string, string][] = [
  ["How much do I need for a down payment?", "At least 5% of the first $500,000 and 10% of the portion up to $1.5M. Homes over $1.5M need 20%. Under 20% down, your mortgage needs default insurance (CMHC), which is added to the loan."],
  ["What is the mortgage stress test?", "Lenders check that you could still afford payments at the higher of 5.25% or your rate plus 2%. The affordability calculator above applies it for you."],
  ["Do I pay land transfer tax in Alberta?", "No. Alberta charges only small land titles registration fees, so closing costs are typically around 1% of the price or less."],
  ["Does it cost me anything to work with a buyer's agent?", "In most Calgary sales the buyer's agent is paid from the seller's proceeds. We will explain how compensation works on any home before you make an offer."],
  ["How long does buying take?", "Many buyers find a home within one to three months of searching; closing is usually 30 to 60 days after your offer is accepted."],
];

export default async function BuyPage() {
  const { stats, budgets, types } = await buyData();
  return <InnerPage>
    <PageHero eyebrow="BUY WITH PEACE OF MIND" title="Make your next home decision with clarity." copy="Know your budget in a minute, see every cost up front, and explore live Calgary listings that fit — with a team guiding you all the way to the keys." image="property.png" />
    <MarketStrip stats={stats} />

    <section className="mk-section shell" id="affordability">
      <SectionHead label="AFFORDABILITY" title="How much home can you afford?" copy="Built on the same stress test and debt ratios lenders use — then see the live homes that fit." />
      <AffordabilityCalculator />
    </section>

    <section className="mk-section mk-tinted">
      <div className="shell">
        <SectionHead label="BROWSE BY BUDGET" title="Find your price range." copy="Live counts from homes for sale right now." />
        <div className="mk-budgets">{BUDGETS.map((band, i) => {
          const params = new URLSearchParams();
          if (band.min) params.set("min", String(band.min));
          if (band.max) params.set("max", String(band.max));
          return <Link key={band.label} href={`/search?${params}#listing-results`}>
            <b>{band.label}</b><small>{band.copy}</small><span>{count.format(budgets[i])} homes →</span>
          </Link>;
        })}</div>
        <SectionHead label="BROWSE BY HOME TYPE" title="Or start with the kind of home." />
        <div className="mk-types">{TYPE_CHOICES.map((choice, i) => <Link key={choice.value} href={`/search?type=${encodeURIComponent(choice.value)}#listing-results`}>
          <span aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{TYPE_ICONS[choice.icon]}</svg></span>
          <div><b>{choice.title}</b><small>{count.format(types[i])} for sale</small></div>
        </Link>)}</div>
      </div>
    </section>

    <section className="mk-section shell">
      <SectionHead label="YOUR BUYING JOURNEY" title="A clear plan from wish list to possession." copy="Seven steps, with a realistic timeline for each." />
      <Timeline steps={steps} />
    </section>

    <section className="mk-section shell" id="closing-costs">
      <SectionHead label="CLOSING COSTS" title="Every cost, up front." copy="Estimate what you will need on top of your down payment in Alberta." />
      <ClosingCostEstimator defaultPrice={stats?.medianPrice ? Math.round(stats.medianPrice / 5000) * 5000 : 550_000} />
    </section>

    <section className="mk-section mk-tinted">
      <div className="shell">
        <SectionHead label="FIRST-TIME BUYERS" title="Programs that put money back in your pocket." copy="Federal programs available in Alberta. We will help you line them up with your lender and accountant." />
        <div className="mk-programs">{programs.map(([icon, title, copy, tag]) => <article key={title}>
          <span aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg></span>
          <em>{tag}</em><h3>{title}</h3><p>{copy}</p>
        </article>)}</div>
        <small className="mk-disclaimer">Program limits as published by the Government of Canada; confirm eligibility with your financial advisor.</small>
      </div>
    </section>

    <section className="preapproval-route" id="pre-approval"><div className="shell content-split"><div><p className="section-label">MORTGAGE PRE-APPROVAL</p><h2>Know your range before the right home appears.</h2></div><div><p>A pre-approval helps focus your search, prepares you to act quickly, and can strengthen your offer. We can introduce you to trusted mortgage professionals who can explain your options.</p><Link className="button green" href="/contact?interest=pre-approval">Get connected</Link></div></div></section>

    <section className="mk-section shell">
      <SectionHead label="BUYER QUESTIONS" title="Answers before you start." />
      <Faq items={faq} />
    </section>

    <InnerCta title="Ready to begin your home search?" />
  </InnerPage>;
}
