import type { Metadata } from "next";
import { Suspense } from "react";
import { InnerPage, PageHero } from "../site-components";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact ToorAvenues | Calgary Real Estate", description: "Contact ToorAvenues for Calgary buying, selling, property-search, and home-value guidance." };

async function PrefilledContactForm({ searchParams }: { searchParams: PageProps<"/contact">["searchParams"] }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  return <ContactForm interest={first(params.interest)} listing={first(params.listing)} />;
}

export default function ContactPage({ searchParams }: PageProps<"/contact">) {
  return <InnerPage><PageHero eyebrow="CONTACT TOORAVENUES" title="Let’s talk about what comes next." copy="Buying, selling, or still exploring? Tell us where you are in the process and we will help you choose the next step." image="hero.png" />
    <section className="contact-layout shell"><div className="contact-details"><p className="section-label">GET IN TOUCH</p><h2>Local advice is one conversation away.</h2><div><b>Davinder Toor</b><a href="tel:4039264000">403-926-4000</a><span>Founder &amp; REALTOR® · eXp Realty</span></div><div><b>Eknoor Toor</b><a href="tel:4039261122">403-926-1122</a><span>REALTOR® · LPT Realty</span></div><div><b>Email</b><a href="mailto:info@tooravenues.com">info@tooravenues.com</a></div><div><b>Office</b><span>#700 - 1816 Crowchild Trail NW<br />Calgary, AB T2M 3Y7</span><span>Monday–Friday · 9:00 AM–6:00 PM</span></div></div>
      <Suspense fallback={<ContactForm />}><PrefilledContactForm searchParams={searchParams} /></Suspense></section></InnerPage>;
}
