import type { Metadata } from "next";
import Link from "next/link";
import { InnerCta, InnerPage, PageHero } from "../site-components";

export const metadata: Metadata = { title: "Buy a Home in Calgary | ToorAvenues", description: "Navigate Calgary home buying, pre-approval, property tours, offers, inspections, and closing with ToorAvenues." };
const steps = ["Define your goals and must-haves","Understand your budget and get pre-approved","Build a focused property search","Tour and evaluate the right homes","Prepare and negotiate a smart offer","Complete inspection and conditions","Finalize the purchase and move in"];

export default function BuyPage() {
  return <InnerPage><PageHero eyebrow="BUY WITH PEACE OF MIND" title="Make your next home decision with clarity." copy="Local market insight, curated property searches, guided tours, and experienced negotiation for every stage of your Calgary home purchase." image="property.png" />
    <section className="inner-section shell"><div className="content-split"><div><p className="section-label">YOUR BUYING JOURNEY</p><h2>A clear plan from wish list to possession.</h2></div><div><p>Whether this is your first home, an upgrade, or an investment, we help you compare the full picture: location, property condition, market value, future potential, and offer terms.</p><Link className="text-route-link" href="/search">Start exploring homes →</Link></div></div><ol className="buyer-steps">{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2,"0")}</span>{step}</li>)}</ol></section>
    <section className="preapproval-route" id="pre-approval"><div className="shell content-split"><div><p className="section-label">MORTGAGE PRE-APPROVAL</p><h2>Know your range before the right home appears.</h2></div><div><p>A pre-approval helps focus your search, prepares you to act quickly, and can strengthen your offer. We can introduce you to trusted mortgage professionals who can explain your options.</p><Link className="button green" href="/contact?interest=pre-approval">Get connected</Link></div></div></section><InnerCta title="Ready to begin your home search?" /></InnerPage>;
}
