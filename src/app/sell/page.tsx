import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { cachedMarket } from "../market-data";
import { HomeValueEstimator, NetProceedsCalculator } from "../market-tools";
import { Faq, MarketStrip, SectionHead, Timeline, icons, type TimelineStep } from "../market-sections";
import { InnerCta, InnerPage, PageHero } from "../site-components";

export const metadata: Metadata = {
  title: "Sell Your Home | Free Home Value Estimate Anywhere in Canada | ToorAvenues",
  description: "Get an instant home value estimate from live listings in your city, see what you'll net after costs, and sell with a personalized ToorAvenues strategy.",
};

// Market data for the page, from the market summary stored by each sync.
async function sellData() {
  "use cache";
  cacheLife("hours");
  const market = await cachedMarket();
  const stats = market ? { total: market.total, fresh: market.fresh, medianPrice: market.medianPrice, medianDays: market.medianDays } : null;
  // Cities with enough homes to estimate from, for the estimator's city picker.
  const cities = (market?.cities ?? []).filter(city => city.count >= 15).map(({ city, province, code, count }) => ({ city, province, code, count }));
  return { stats, cities, snapshot: market?.cities.slice(0, 12) ?? [] };
}

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const steps: TimelineStep[] = [
  { title: "Prepare", time: "Week 1–2", copy: "A walkthrough to spot the small fixes, staging and timing choices that buyers reward most.", icon: icons.home },
  { title: "Price", time: "Week 2", copy: "Comparable sales, active competition and buyer demand turned into a clear pricing strategy.", icon: icons.tag },
  { title: "Launch", time: "Week 3", copy: "Professional photos, video and a coordinated launch on MLS®, REALTOR.ca and social media.", icon: icons.camera },
  { title: "Negotiate", time: "Offers", copy: "Every offer compared on price, conditions, deposit and possession — not just the headline number.", icon: icons.chat },
  { title: "Close", time: "30–60 days", copy: "Conditions, lawyers and dates coordinated so moving day arrives without surprises.", icon: icons.key },
];

const marketing: [React.ReactNode, string, string][] = [
  [icons.camera, "Professional photography", "Bright, magazine-quality photos — the first showing happens online."],
  [icons.video, "Video & social reels", "Short-form video that travels on Instagram, Facebook and YouTube."],
  [icons.cube, "3D tour & floor plan", "Buyers walk through from anywhere, so the people who book are serious."],
  [icons.megaphone, "Targeted digital ads", "Paid campaigns aimed at buyers searching your area and price range."],
  [icons.sign, "MLS® & REALTOR.ca", "Full exposure on the systems every agent and buyer uses."],
  [icons.users, "Open houses & network", "Hosted open houses plus direct outreach to agents with active buyers."],
];

const faq: [string, string][] = [
  ["How accurate is the instant estimate?", "It is a starting point based on comparable homes for sale right now (asking prices). A full evaluation also weighs recent sold prices, condition, upgrades and lot — that is what we prepare for you, free."],
  ["When is the best time to sell?", "In most Canadian markets spring brings the most buyers, but less competition in fall and winter can work in your favour. We look at current inventory in your city and community before recommending a launch date."],
  ["What does it cost to sell?", "The main costs are commission, legal fees and your mortgage payout. Use the net proceeds calculator above for a quick picture; we will give you exact numbers before you list."],
  ["Should I renovate before selling?", "Usually only small, high-return items: paint, lighting, repairs and staging. We will tell you what is worth doing — and what is not — for your home and price point."],
  ["Can I buy and sell at the same time?", "Yes. We plan the timing, conditions and possession dates of both sides together so you are not carrying two homes or rushing a move."],
];

export default async function SellPage() {
  const { stats, cities, snapshot } = await sellData();
  return <InnerPage>
    <PageHero eyebrow="SELL WITH CONFIDENCE" title="A selling strategy designed around your home." copy="See what your home could be worth in seconds, what you would walk away with, and how we get you there — with evidence, not guesswork." image="architecture.png" />
    <MarketStrip stats={stats} />

    <section className="mk-section shell" id="home-value">
      <SectionHead label="INSTANT HOME VALUE" title="What is your home worth today?" copy="Pick your city (and community, if you like) and your home details. We compare it with similar homes for sale right now and show you the range — plus the listings it is based on." />
      <HomeValueEstimator cities={cities} />
    </section>

    <section className="mk-section mk-tinted">
      <div className="shell">
        <SectionHead label="HOW WE SELL" title="From first walkthrough to keys handed over." copy="A clear plan with a timeline, so you always know what happens next." />
        <Timeline steps={steps} />
      </div>
    </section>

    <section className="mk-section shell">
      <SectionHead label="MARKETING THAT MOVES HOMES" title="Your home, presented to every serious buyer." />
      <div className="mk-features">{marketing.map(([icon, title, copy]) => <article key={title}>
        <span aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg></span>
        <h3>{title}</h3><p>{copy}</p>
      </article>)}</div>
    </section>

    <section className="mk-section shell" id="net-proceeds">
      <SectionHead label="NET PROCEEDS" title="What will you walk away with?" copy="Adjust the numbers to see your estimated cash at closing after the mortgage and selling costs." />
      <NetProceedsCalculator defaultPrice={stats?.medianPrice ? Math.round(stats.medianPrice / 5000) * 5000 : 650_000} />
    </section>

    {snapshot.length > 0 && <section className="mk-section shell">
      <SectionHead label="MARKET SNAPSHOT" title="What is happening in Canada’s busiest markets." copy="Homes for sale, typical asking prices and price per square foot in the cities with the most listings right now." />
      <div className="mk-table-wrap"><table className="mk-table">
        <thead><tr><th>City</th><th>Homes for sale</th><th>Typical asking price</th><th>Price / sq ft</th><th /></tr></thead>
        <tbody>{snapshot.map(row => <tr key={`${row.city}-${row.code}`}>
          <td><b>{row.city}</b><small>{row.province}</small></td>
          <td>{row.count.toLocaleString("en-CA")}</td>
          <td>{money.format(row.medianPrice)}</td>
          <td>{row.medianPpsf ? `$${row.medianPpsf}` : "—"}</td>
          <td><Link href={`/search?city=${encodeURIComponent(row.city)}&province=${row.code}#listing-results`}>View homes →</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    <section className="evaluation-panel shell"><div><p>COMPLIMENTARY MARKET EVALUATION</p><h2>Want the exact number?</h2><span>Get a property-specific review of recent sales, competition and current buyer activity — free, with no obligation.</span></div><Link className="button green" href="/contact?interest=home-value">Request my home value</Link></section>

    <section className="mk-section shell">
      <SectionHead label="SELLER QUESTIONS" title="Answers before you list." />
      <Faq items={faq} />
    </section>

    <InnerCta title="Thinking about selling?" copy="Even if your move is months away, an early conversation can help you prepare with clarity." />
  </InnerPage>;
}
