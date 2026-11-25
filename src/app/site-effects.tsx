"use client";

import { useEffect } from "react";

const MAGNETIC = ".cine-btn,.sf-go,.lf-apply,.button,.ed-pill,.listing-sticky-cta,.mosaic-all,.map-search-area";

/**
 * Site-wide touches: a reading-progress bar (pure CSS) and "magnetic" primary buttons
 * that lean toward the cursor. Mouse only; skipped for reduced motion.
 */
export function SiteEffects() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let active: HTMLElement | null = null;
    let frame = 0;
    const release = (element: HTMLElement) => { element.style.translate = ""; element.style.transition = ""; };
    const onMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(MAGNETIC) : null;
      if (active && active !== target) release(active);
      active = target;
      if (!target) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = target.getBoundingClientRect();
        const x = (event.clientX - box.left - box.width / 2) / box.width;
        const y = (event.clientY - box.top - box.height / 2) / box.height;
        target.style.transition = "translate .15s ease-out";
        target.style.translate = `${(x * 10).toFixed(1)}px ${(y * 8).toFixed(1)}px`;
      });
    };
    const onLeave = () => { if (active) release(active); active = null; };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (active) release(active);
    };
  }, []);
  return <div className="scroll-progress" aria-hidden="true" />;
}
