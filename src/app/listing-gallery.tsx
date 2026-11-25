"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PhotoStage } from "./photo-stage";

type GalleryProps = {
  photos: string[];
  alt: string;
  /** "page" shows a thumbnail strip; "modal" fits the listing pop-up. */
  variant?: "page" | "modal";
  sizes?: string;
  priority?: boolean;
};

export function ListingGallery({ photos, alt, variant = "page", sizes = "(max-width: 760px) 100vw, 860px", priority = false }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const total = photos.length;
  const current = Math.min(index, Math.max(0, total - 1));

  // Keep the active thumbnail visible by scrolling only the strip (never the page).
  useEffect(() => {
    const container = strip.current;
    const thumb = container?.querySelector<HTMLElement>(`[data-index="${current}"]`);
    if (!container || !thumb) return;
    container.scrollTo({ left: thumb.offsetLeft - (container.clientWidth - thumb.clientWidth) / 2, behavior: "smooth" });
  }, [current]);

  if (!total) return null;
  const go = (step: number) => setIndex((current + step + total) % total);

  return <div className={`listing-gallery ${variant}`} role="region" aria-roledescription="carousel" aria-label={`${alt} photos`}
    tabIndex={0} onKeyDown={event => { if (event.key === "ArrowRight") go(1); if (event.key === "ArrowLeft") go(-1); }}>
    <div className="listing-gallery-stage"
      onTouchStart={event => { touchStart.current = event.touches[0].clientX; }}
      onTouchEnd={event => {
        if (touchStart.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(distance) > 40) go(distance < 0 ? 1 : -1);
        touchStart.current = null;
      }}>
      <PhotoStage photos={photos} index={current} alt={`${alt}, photo ${current + 1} of ${total}`} sizes={sizes} preload={priority} />
      {total > 1 && <>
        <button type="button" className="listing-gallery-arrow prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
        <button type="button" className="listing-gallery-arrow next" onClick={() => go(1)} aria-label="Next photo">›</button>
      </>}
      <span className="listing-gallery-count" aria-live="polite">{current + 1} / {total}</span>
    </div>
    {variant === "page" && total > 1 && <div className="listing-gallery-thumbs" ref={strip}>
      {photos.map((photo, i) => <button type="button" key={photo} data-index={i} className={i === current ? "active" : ""} onClick={() => setIndex(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === current}>
        <Image src={photo} alt="" fill sizes="120px" />
      </button>)}
    </div>}
  </div>;
}

/** Fetches a listing's photos on demand (used by the search pop-up). */
export function LazyListingGallery({ listingKey, fallback, alt }: { listingKey: string; fallback: string | null; alt: string }) {
  const [photos, setPhotos] = useState<string[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${encodeURIComponent(listingKey)}/photos`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : { photos: [] })
      .then((result: { photos?: string[] }) => setPhotos(result.photos ?? []))
      .catch(() => { if (!controller.signal.aborted) setPhotos([]); });
    return () => controller.abort();
  }, [listingKey]);
  const list = photos?.length ? photos : fallback ? [fallback] : [];
  return <ListingGallery photos={list} alt={alt} variant="modal" sizes="600px" />;
}

/** Records a CREA DDF® analytics "View" event once per mount. */
export function ListingViewEvent({ listingKey }: { listingKey: string }) {
  useEffect(() => {
    try {
      navigator.sendBeacon?.("/api/ddf/analytics", new Blob([JSON.stringify({ listingKey })], { type: "application/json" }));
    } catch { /* best-effort */ }
  }, [listingKey]);
  return null;
}
