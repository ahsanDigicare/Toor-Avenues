"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { createPortal } from "react-dom";
import { PhotoStage } from "./photo-stage";
import { PhotoCarousel } from "./photo-carousel";

// ---------------------------------------------------------------------------
// Listing page showcase: photo mosaic + full-screen lightbox, save / share,
// and a sticky action bar that appears once the page header scrolls away.
// ---------------------------------------------------------------------------

const SAVED_KEY = "toor-saved-homes";

function Lightbox({ photos, alt, start, onClose }: { photos: string[]; alt: string; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const total = photos.length;
  const go = (step: number) => setIndex(current => (current + step + total) % total);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex(current => (current + 1) % total);
      if (event.key === "ArrowLeft") setIndex(current => (current - 1 + total) % total);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose, total]);

  useEffect(() => {
    const thumb = strip.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    thumb?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  return createPortal(<div className="lightbox" role="dialog" aria-modal="true" aria-label={`${alt} photos`}>
    <div className="lightbox-top">
      <span aria-live="polite">{index + 1} / {total}</span>
      <button type="button" onClick={onClose} aria-label="Close photos">×</button>
    </div>
    <div className="lightbox-stage"
      onTouchStart={event => { touch.current = event.touches[0].clientX; }}
      onTouchEnd={event => {
        if (touch.current === null) return;
        const distance = event.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(distance) > 40) go(distance < 0 ? 1 : -1);
      }}>
      <PhotoStage photos={photos} index={index} alt={`${alt}, photo ${index + 1} of ${total}`} sizes="100vw" />
      {total > 1 && <>
        <button type="button" className="lightbox-arrow prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
        <button type="button" className="lightbox-arrow next" onClick={() => go(1)} aria-label="Next photo">›</button>
      </>}
    </div>
    <div className="lightbox-thumbs" ref={strip}>
      {photos.map((photo, i) => <button type="button" key={photo} data-index={i} className={i === index ? "active" : ""} onClick={() => setIndex(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === index}>
        <Image src={photo} alt="" fill sizes="96px" />
      </button>)}
    </div>
  </div>, document.body);
}

/** Large photo + four tiles; any tile or "Show all photos" opens the lightbox. */
export function ListingMosaic({ photos, alt, morphId }: { photos: string[]; alt: string; morphId?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = photos.slice(0, 5);
  return <>
    <div className={`mosaic count-${shown.length}`}>
      {shown.map((photo, i) => {
        if (i === 0) {
          // Main photo: swipe / arrows through every photo; clicking opens the full-screen gallery there.
          const main = <div className="mosaic-tile mosaic-main" key={photo}>
            <PhotoCarousel photos={photos} alt={alt} sizes="(max-width: 760px) 100vw, 60vw" priority onOpen={setOpen} />
          </div>;
          return morphId ? <ViewTransition name={`photo-${morphId}`} share="morph" default="none" key={photo}>{main}</ViewTransition> : main;
        }
        return <button type="button" className="mosaic-tile" key={photo} onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`}>
          <Image src={photo} alt="" fill priority={i < 2} sizes="(max-width: 760px) 50vw, 20vw" />
        </button>;
      })}
      <button type="button" className="mosaic-all" onClick={() => setOpen(0)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        Show all {photos.length} photos
      </button>
    </div>
    {open !== null && <Lightbox photos={photos} alt={alt} start={open} onClose={() => setOpen(null)} />}
  </>;
}

/** Save (heart) and Share buttons. Saved homes are shared with the search page's hearts. */
export function ListingActions({ id, title }: { id: string; title: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setSaved((JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]).includes(id)); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [id]);

  const toggleSave = () => {
    try {
      const list = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[];
      const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id];
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setSaved(next.includes(id));
    } catch { setSaved(current => !current); }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* cancelled */ return; } }
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return <div className="listing-actions">
    <button type="button" className={`listing-action${saved ? " is-saved" : ""}`} onClick={toggleSave} aria-pressed={saved}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.4 3.3 5 6.8 5c2 0 3.4 1 5.2 3 1.8-2 3.2-3 5.2-3 3.5 0 5.6 3.4 4.3 6.7C19.5 16.4 12 21 12 21z" /></svg>
      {saved ? "Saved" : "Save"}
    </button>
    <button type="button" className="listing-action" onClick={share}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" /></svg>
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  </div>;
}

/** Slim bar with price and "Book a showing" that slides in once the header is out of view. */
export function StickyListingBar({ price, payment, address, showingHref, photo }: { price: string; payment: string; address: string; showingHref: string; photo?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.querySelector(".listing-page-head");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return <div className={`listing-sticky${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
    <div className="shell">
      {photo && <span className="listing-sticky-photo"><Image src={photo} alt="" fill sizes="56px" /></span>}
      <div className="listing-sticky-text"><b>{price}</b><span>{address}</span></div>
      <span className="listing-sticky-pay">{payment}</span>
      <Link className="listing-sticky-cta" href={showingHref} tabIndex={visible ? 0 : -1}>Book a showing</Link>
    </div>
  </div>;
}
