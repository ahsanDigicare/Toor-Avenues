import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InnerCta, InnerPage, PageHero } from "../site-components";

export const metadata: Metadata = { title: "Real Estate Services | ToorAvenues", description: "Calgary home selling, buying, mortgage pre-approval, and strategic real estate guidance from ToorAvenues." };

const services = [
  { number: "01", title: "Sell for top dollar", copy: "From market analysis and preparation to marketing, negotiation, and closing, we build a selling plan around your property and priorities.", image: "architecture.png", href: "/sell" },
  { number: "02", title: "Buy with confidence", copy: "Clarify your needs, understand the market, tour the right homes, and negotiate with an experienced local advisor beside you.", image: "property.png", href: "/buy" },
  { number: "03", title: "Plan your financing", copy: "Understand your budget and connect with trusted mortgage professionals before the right property reaches the market.", image: "service.png", href: "/buy#pre-approval" },
];

export default function ServicesPage() {
  return <InnerPage><PageHero eyebrow="OUR SERVICES" title="A smarter path through every real estate decision." copy="Personalized strategy, local insight, and responsive support for Calgary buyers, sellers, and investors." image="hero.png" />
    <section className="inner-section shell"><div className="intro-grid"><p>HOW WE HELP</p><h2>Clear advice from first conversation to closing day.</h2></div><div className="inner-service-grid">{services.map(service => <article key={service.title}><div className="inner-service-image"><Image src={`/assets/${service.image}`} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" /></div><small>{service.number}</small><h3>{service.title}</h3><p>{service.copy}</p><Link href={service.href}>Explore this service →</Link></article>)}</div></section>
    <section className="process-section"><div className="shell"><div className="intro-grid"><p>THE TOORAVENUES APPROACH</p><h2>Professional guidance without the pressure.</h2></div><div className="value-grid">{[["Listen first","We begin with your timing, goals, concerns, and definition of success."],["Build the strategy","Market evidence and local experience shape a practical plan for your move."],["Stay accountable","You receive clear communication, next steps, and guidance through every decision."]].map(([title,copy], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section><InnerCta /></InnerPage>;
}
