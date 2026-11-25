"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Photo carousel built on the browser's own scroll-snap strip:
//  · swiping (touch, trackpad) is native and works even before JavaScript runs;
//  · the arrows simply scroll the strip one photo, so nothing can block them;
//  · the counter follows the scroll position.
// Optionally fetches the full photo list (cards start with just the cover photo).
// ---------------------------------------------------------------------------

type Props = {
  photos: string[];
  /** Total photos available (shown before the full list is fetched). */
  count?: number;
  /** Listing key whose full photo list is fetched from /api/listings/{key}/photos. */
  fetchKey?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** Clicking a photo opens it (e.g. in a full-screen gallery). */
  onOpen?: (index: number) => void;
  /** Clicking a photo goes to this page (e.g. the listing's detail page from a card). */
  href?: string;
};

export function PhotoCarousel({ photos: initial, count, fetchKey, alt, sizes, priority = false, onOpen, href }: Props) {
  const [photos, setPhotos] = useState(initial);
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const loading = useRef<Promise<string[]> | null>(null);
  const frame = useRef(0);
  const total = Math.max(photos.length, count ?? 0);

  function load(): Promise<string[]> {
    if (!fetchKey || photos.length > 1) return Promise.resolve(photos);
    loading.current ??= fetch(`/api/listings/${encodeURIComponent(fetchKey)}/photos`)
      .then(response => response.ok ? response.json() : { photos: [] })
      .then((result: { photos?: string[] }) => {
        const cover = initial[0];
        const list = result.photos?.length ? result.photos : initial;
        // Keep the cover first so the first step moves exactly one photo.
        const ordered = cover && list.includes(cover) ? [cover, ...list.filter(url => url !== cover)] : list;
        setPhotos(ordered);
        return ordered;
      })
      .catch(() => { loading.current = null; return initial; });
    return loading.current;
  }

  // Fetch the full list as soon as the carousel is near the screen.
  useEffect(() => {
    const node = strip.current;
    if (!node || !fetchKey || (count ?? 0) < 2) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void load();
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
    // load() reads refs and the initial props only; once per carousel is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, count]);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = strip.current;
      if (node && node.clientWidth) setIndex(Math.round(node.scrollLeft / node.clientWidth));
    });
  };

  async function step(direction: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const node = strip.current;
    if (!node) return;
    let list = photos;
    if (list.length < 2) {
      list = await load();
      if (list.length < 2) return;
      // Let React render the new slides before scrolling to them.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    const width = node.clientWidth || 1;
    const current = Math.round(node.scrollLeft / width);
    const next = (current + direction + list.length) % list.length;
    setIndex(next);
    node.scrollTo({ left: next * width, behavior: Math.abs(next - current) === 1 ? "smooth" : "auto" });
  }

  return <>
    <div className="snap-strip" ref={strip} onScroll={onScroll} onPointerEnter={() => void load()} onTouchStart={() => void load()}>
      {photos.map((src, i) => {
        const image = <Image src={src} alt={i === 0 ? alt : `${alt}, photo ${i + 1}`} fill sizes={sizes}
          priority={priority && i === 0} loading={priority && i === 0 ? undefined : Math.abs(i - index) <= 1 ? "eager" : "lazy"} draggable={false} />;
        // Only the first photo is a tab stop; the arrows move through the rest.
        if (href) return <Link href={href} className="snap-slide" key={src} draggable={false} tabIndex={i === 0 ? undefined : -1} aria-label={i === 0 ? `View details: ${alt.replace(/^Photo of /, "")}` : undefined}>{image}</Link>;
        return onOpen
          ? <button type="button" className="snap-slide" key={src} onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1} of ${total}`}>{image}</button>
          : <div className="snap-slide" key={src}>{image}</div>;
      })}
    </div>
    {total > 1 && <>
      <button type="button" className="card-photo-nav prev" aria-label="Previous photo" onClick={event => void step(-1, event)}>‹</button>
      <button type="button" className="card-photo-nav next" aria-label="Next photo" onClick={event => void step(1, event)}>›</button>
      <span className="card-photo-count" aria-live="polite">{Math.min(index, total - 1) + 1} / {total} photos</span>
    </>}
  </>;
}
