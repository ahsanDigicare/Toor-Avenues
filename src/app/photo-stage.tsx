"use client";

import Image from "next/image";
import { useState } from "react";

type PhotoStageProps = {
  photos: string[];
  index: number;
  alt: string;
  sizes: string;
  /** Preload the first photo (above-the-fold galleries). */
  preload?: boolean;
};

/**
 * Stacked photo layers for carousels. The photo on screen stays visible until the
 * newly selected one has finished loading, then the new one fades in, so stepping
 * through photos never flashes an empty frame. The photos either side of the
 * selection are loaded in the background so the next step is instant.
 */
export function PhotoStage({ photos, index, alt, sizes, preload = false }: PhotoStageProps) {
  const total = photos.length;
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState(photos[index]);
  const target = photos[index];

  // Once the selected photo has loaded it becomes the one on screen.
  if (target && loaded.has(target) && shown !== target) setShown(target);
  // Keeps showing the previous photo even if the list was just replaced (cover → full list).
  const visible = shown ?? target;

  if (!total) return null;
  const layers = [...new Set([visible, target, photos[(index + 1) % total], photos[(index - 1 + total) % total]])].filter(Boolean);

  return <>
    {target !== visible && <span className="photo-loading" aria-hidden="true" />}
    {layers.map(src => {
      const isVisible = src === visible;
      return <Image
        key={src}
        src={src}
        alt={isVisible ? alt : ""}
        aria-hidden={isVisible ? undefined : true}
        fill
        sizes={sizes}
        preload={preload && src === photos[0]}
        loading="eager"
        className={`photo-layer${isVisible ? " is-visible" : ""}`}
        onLoad={() => setLoaded(current => current.has(src) ? current : new Set(current).add(src))}
      />;
    })}
  </>;
}
