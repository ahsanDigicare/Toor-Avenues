"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/** Small OpenStreetMap with a single pin for the listing page. */
export function ListingLocationMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { center: [lat, lng], zoom: 14, scrollWheelZoom: false, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.marker([lat, lng], { icon: L.divIcon({ className: "map-pin is-hot", html: `<span>${label.replace(/[<>&"]/g, "")}</span>`, iconSize: [0, 0] }), keyboard: false }).addTo(map);
      L.circle([lat, lng], { radius: 600, color: "#188c63", weight: 1, fillColor: "#188c63", fillOpacity: .08 }).addTo(map);
      remove = () => map.remove();
    });
    return () => { cancelled = true; remove?.(); };
  }, [lat, lng, label]);
  return <div ref={element} className="listing-location-map" role="img" aria-label="Map showing the location of this home" />;
}
