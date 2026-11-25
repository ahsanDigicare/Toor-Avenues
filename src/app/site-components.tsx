import Image from "next/image";
import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { NavLinks } from "./nav-links";
import { MobileMenu } from "./mobile-menu";

const A = "/assets/";

export const navigation = [
  ["Home", "/"],
  ["Search", "/search"],
  ["Services", "/services"],
  ["Sell", "/sell"],
  ["Buy", "/buy"],
  ["About", "/about"],
] as const;

export function SiteHeader() {
  return <header className="site-header"><div className="shell site-nav">
    <Link className="site-logo" href="/" aria-label="ToorAvenues home"><span><Image src="/figma-home/brand-mark.png" alt="" fill sizes="(max-width: 760px) 54px, 76px" priority /></span><b>ToorAvenues</b></Link>
    <nav aria-label="Main navigation">
      {/* The current-section highlight reads the URL, so it streams in; plain links render first. */}
      <Suspense fallback={navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}><NavLinks links={navigation} /></Suspense>
    </nav>
    <Link className="button green" href="/contact">Contact us</Link>
    <MobileMenu links={navigation} />
  </div></header>;
}

export function PageHero({ eyebrow, title, copy, image = "cranston.png" }: { eyebrow: string; title: string; copy: string; image?: string }) {
  return <section className="page-hero"><Image src={`${A}${image}`} alt="" fill priority sizes="100vw" /><div className="page-hero-shade" /><div className="shell"><p>{eyebrow}</p><h1>{title}</h1><div className="page-hero-copy">{copy}</div></div></section>;
}

export function InnerCta({ title = "Ready to plan your next move?", copy = "Tell us what you are working toward. We will help you understand the market and choose a clear next step." }: { title?: string; copy?: string }) {
  return <section className="inner-cta shell"><div><p>LOCAL GUIDANCE, BUILT AROUND YOU</p><h2>{title}</h2><span>{copy}</span></div><Link className="button yellow" href="/contact">Talk with our team</Link></section>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="shell"><div className="site-footer-brand"><Link href="/">ToorAvenues</Link><p>Team of Outstanding REALTORS®. Helping you sell with confidence and buy with peace of mind.</p></div><div className="site-footer-grid">
    <div><b>EXPLORE</b>{navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}<Link href="/contact">Contact</Link></div>
    <div><b>GET IN TOUCH</b><a href="tel:4039264000">403-926-4000</a><a href="tel:4039261122">403-926-1122</a><a href="mailto:info@tooravenues.com">info@tooravenues.com</a></div>
    <div><b>CALGARY OFFICE</b><p>#700 - 1816 Crowchild Trail NW<br />Calgary, AB T2M 3Y7</p><p>Monday–Friday<br />9:00 AM–6:00 PM</p></div>
  </div><div className="site-footer-legal"><span>© 2026 ToorAvenues. All rights reserved. · <Link href="/privacy-policy">Privacy policy</Link> · <a href="https://www.facebook.com/ToorAvenues/" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.instagram.com/tooravenues/" target="_blank" rel="noopener">Instagram</a></span><p>Davinder Toor, REALTOR®, is registered with eXp Realty. Eknoor Toor, REALTOR®, is registered with LPT Realty. ToorAvenues is a team name and not a brokerage.</p></div></div></footer>;
}

export function InnerPage({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><ViewTransition enter="page-in" exit="page-out" default="none"><main className="inner-page">{children}</main></ViewTransition><SiteFooter /></>;
}
