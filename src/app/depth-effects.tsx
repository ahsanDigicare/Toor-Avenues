"use client";

import { useEffect } from "react";

// Cards that tilt toward the cursor (with a soft glare) and rise into place in 3D.
// Listing cards are deliberately left out: their photo arrows must stay perfectly still
// under the cursor, and a tilting card moves them away mid-click.
const TILT_CARDS = [
  ".ed-exclusive-grid article",
  ".ed-community-grid>article",
  ".ed-service-list>article",
  ".ed-values>article",
  ".ed-articles>article",
].join(",");

// Areas whose layers shift in depth as the cursor moves over them.
const DEPTH_ZONES = ".cine-hero,.ed-hero,.ed-founder,.ed-landscape";

/**
 * Homepage 3D depth: mouse-driven tilt on cards, layered parallax in the hero,
 * founder portrait and landscape banner, and scroll parallax in the hero.
 * Everything is driven by CSS custom properties, so it costs no re-renders.
 * Skipped entirely for visitors who prefer reduced motion; the pointer effects
 * only run with a mouse (touch devices keep the scroll effects).
 */
export function DepthEffects() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector<HTMLElement>(".editorial-home");
    if (!root) return;

    root.classList.add("has-depth");
    const cards = [...root.querySelectorAll<HTMLElement>(TILT_CARDS)];
    cards.forEach(card => card.classList.add("tilt"));
    const hero = root.querySelector<HTMLElement>(".cine-hero, .ed-hero");

    // Batch all style writes into one animation frame.
    let frame = 0;
    let queue: (() => void)[] = [];
    const schedule = (job: () => void) => {
      queue.push(job);
      frame ||= requestAnimationFrame(() => { frame = 0; const jobs = queue; queue = []; jobs.forEach(run => run()); });
    };

    const onScroll = () => schedule(() => hero?.style.setProperty("--sy", Math.min(1, window.scrollY / 700).toFixed(3)));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let activeCard: HTMLElement | null = null;
    let activeZone: HTMLElement | null = null;
    const resetCard = (card: HTMLElement) => {
      card.classList.remove("is-tilting");
      ["--rx", "--ry"].forEach(name => card.style.removeProperty(name));
    };
    const resetZone = (zone: HTMLElement) => ["--mx", "--my"].forEach(name => zone.style.removeProperty(name));

    // Never move a card while it is being clicked or while the pointer is on one of its
    // controls (photo arrows, links): a moving target cancels the click.
    let pressed = false;
    const onDown = () => { pressed = true; };
    const onUp = () => { pressed = false; };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || pressed) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".tilt") && target.closest("button, a, input, select, label, [role='button']")) return;
      const card = target?.closest<HTMLElement>(".tilt") ?? null;
      const zone = target?.closest<HTMLElement>(DEPTH_ZONES) ?? null;
      const { clientX, clientY } = event;
      schedule(() => {
        if (activeCard && activeCard !== card) resetCard(activeCard);
        if (activeZone && activeZone !== zone) resetZone(activeZone);
        activeCard = card;
        activeZone = zone;
        if (card) {
          const box = card.getBoundingClientRect();
          const x = (clientX - box.left) / box.width;
          const y = (clientY - box.top) / box.height;
          card.classList.add("is-tilting");
          card.style.setProperty("--rx", `${((0.5 - y) * 16).toFixed(2)}deg`);
          card.style.setProperty("--ry", `${((x - 0.5) * 20).toFixed(2)}deg`);
          card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
          card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
        }
        if (zone) {
          const box = zone.getBoundingClientRect();
          zone.style.setProperty("--mx", (((clientX - box.left) / box.width - 0.5) * 2).toFixed(3));
          zone.style.setProperty("--my", (((clientY - box.top) / box.height - 0.5) * 2).toFixed(3));
        }
      });
    };
    const onLeave = () => schedule(() => {
      if (activeCard) resetCard(activeCard);
      if (activeZone) resetZone(activeZone);
      activeCard = activeZone = null;
    });

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      root.classList.remove("has-depth");
      cards.forEach(card => { card.classList.remove("tilt"); resetCard(card); });
    };
  }, []);

  return null;
}
