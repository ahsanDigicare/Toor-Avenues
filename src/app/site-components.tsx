import Image from "next/image";
import Link from "next/link";

const A = "/assets/";

export const navigation = [
  ["Search", "/search"],
  ["Services", "/services"],
  ["Sell", "/sell"],
  ["Buy", "/buy"],
  ["About", "/about"],
] as const;

export function SiteHeader() {
  return <header className="site-header"><div className="shell site-nav">
    <Link className="site-logo" href="/"><Image src={`${A}logo.png`} alt="ToorAvenues home" width={104} height={70} priority /></Link>
    <nav aria-label="Main navigation">{navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
    <Link className="button yellow" href="/contact">Contact us</Link>
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
  </div><div className="site-footer-legal">© 2026 ToorAvenues. All rights reserved.</div></div></footer>;
}

export function InnerPage({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main className="inner-page">{children}</main><SiteFooter /></>;
}
