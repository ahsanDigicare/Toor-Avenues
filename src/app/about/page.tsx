import type { Metadata } from "next";
import Image from "next/image";
import { InnerCta, InnerPage, PageHero } from "../site-components";

export const metadata: Metadata = { title: "About ToorAvenues | Calgary REALTORS®", description: "Meet the ToorAvenues team and learn about our approach to Calgary real estate." };

export default function AboutPage() {
  return <InnerPage><PageHero eyebrow="ABOUT TOORAVENUES" title="Your goals become our mission." copy="Experience, integrity, and a genuine commitment to helping Calgary clients move forward with confidence." image="cranston.png" />
    <section className="inner-section shell"><div className="content-split"><div><p className="section-label">OUR STORY</p><h2>Real estate built on relationships and results.</h2></div><div><p>ToorAvenues brings together local market knowledge, analytical thinking, personalized attention, and a practical approach to every purchase and sale.</p><p>We believe the best real estate experience is informed, responsive, and centered on what success means to each client.</p></div></div><div className="team-grid"><article><div><Image src="/assets/founder.png" alt="Davinder Toor" fill sizes="(max-width: 760px) 100vw, 50vw" /></div><small>FOUNDER &amp; REALTOR® · EXP REALTY</small><h2>Davinder Toor</h2><p>Working in Calgary real estate since 2012, Davinder combines market knowledge, strategic thinking, and a results-driven approach with attentive client service.</p><a href="tel:4039264000">403-926-4000</a></article><article className="team-copy-card"><small>REALTOR® · LPT REALTY</small><h2>Eknoor Toor</h2><p>Eknoor brings local knowledge, business insight, and a genuine passion for helping clients navigate Calgary real estate with clarity and care.</p><a href="tel:4039261122">403-926-1122</a><a href="mailto:eknoorktoor@gmail.com">eknoorktoor@gmail.com</a></article></div></section><InnerCta title="Meet your local real estate partners." /></InnerPage>;
}
