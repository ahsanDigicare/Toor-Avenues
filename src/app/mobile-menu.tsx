"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MenuLink = readonly [label: string, href: string];

/** Hamburger button + full-screen navigation panel for phones and small tablets. */
export function MobileMenu({ links }: { links: readonly MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("/");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trigger = button.current;
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; trigger?.focus(); };
  }, [open]);

  const toggle = () => { setPath(window.location.pathname); setOpen(current => !current); };
  const isCurrent = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/search" && path.startsWith("/listing"));

  return <>
    <button ref={button} type="button" className={`menu-toggle${open ? " is-open" : ""}`} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={toggle}>
      <span /><span /><span />
    </button>
    {open && createPortal(<div className="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Site menu" onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="mobile-menu-panel" ref={panel}>
        <div className="mobile-menu-top">
          <b>ToorAvenues</b>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav aria-label="Main navigation">
          {links.map(([label, href], i) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={isCurrent(href) ? "page" : undefined} style={{ "--i": i } as React.CSSProperties}>
            {label}<span aria-hidden="true">→</span>
          </Link>)}
        </nav>
        <div className="mobile-menu-actions">
          <Link className="mobile-menu-cta" href="/contact?interest=home-value" onClick={() => setOpen(false)}>Free Market Evaluation</Link>
          <div>
            <a href="tel:+14039264000">Call 403-926-4000</a>
            <a href="mailto:info@tooravenues.com">Email us</a>
          </div>
        </div>
        <small>TOOR — Team of Outstanding REALTORS®</small>
      </div>
    </div>, document.body)}
  </>;
}
