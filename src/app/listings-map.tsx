"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LatLngBoundsExpression, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import type { MapPoint } from "../lib/listings";

type Props = {
  /** Current search as a query string (without page / sort / view / bounds). */
  query: string;
  /** "south,west,north,east" when the results are limited to a map area. */
  bounds?: string;
  /** Listing highlighted from the results list (hovered card). */
  hoveredId?: string | null;
};

const CANADA: [number, number] = [53.5, -96];
const count = new Intl.NumberFormat("en-CA");
const shortPrice = (value: number) => value >= 995_000 ? `$${Number((value / 1_000_000).toFixed(1))}M` : `$${Math.round(value / 1000)}K`;
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/**
 * Interactive OpenStreetMap of the current search: price pins, clusters that split as
 * you zoom, photo pop-ups, hover highlighting from the list, and "Search this area".
 */
export default function ListingsMap({ query, bounds, hoveredId = null }: Props) {
  const router = useRouter();
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [total, setTotal] = useState(0);
  const [moved, setMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const programmatic = useRef(true);

  // Pins for the whole search.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/map?${query}`, { signal: controller.signal })
      .then(response => response.json())
      .then((result: { points: MapPoint[]; total: number }) => { setPoints(result.points); setTotal(result.total); })
      .catch(() => { if (!controller.signal.aborted) setPoints([]); });
    return () => controller.abort();
  }, [query]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | null = null;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !element.current) return;
      instance = L.map(element.current, { center: CANADA, zoom: 4, zoomControl: false, attributionControl: true, scrollWheelZoom: true });
      L.control.zoom({ position: "topright" }).addTo(instance);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(instance);
      instance.on("dragstart zoomstart", () => { if (!programmatic.current) setMoved(true); });
      instance.on("moveend", () => { programmatic.current = false; });
      map.current = instance;
      setReady(true);
    });
    return () => { cancelled = true; instance?.remove(); map.current = null; };
  }, []);

  // Draw pins and clusters whenever the data or the view changes.
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance || !points) return;
    let layer: LayerGroup | null = null;
    let redraw: (() => void) | null = null; // detaches this draw's map listeners
    let disposed = false;

    import("leaflet").then(({ default: L }) => {
      if (disposed) return;
      layer = L.layerGroup().addTo(instance);
      const draw = () => {
        layer!.clearLayers();
        markers.current.clear();
        const zoom = instance.getZoom();
        const view = instance.getBounds().pad(0.25);
        const cells = new Map<string, MapPoint[]>();
        for (const point of points) {
          if (!view.contains([point.lat, point.lng])) continue;
          const pixel = instance.project([point.lat, point.lng], zoom);
          const key = `${Math.floor(pixel.x / 120)}:${Math.floor(pixel.y / 100)}`;
          const cell = cells.get(key);
          if (cell) cell.push(point); else cells.set(key, [point]);
        }
        for (const group of cells.values()) {
          if (group.length <= 2 || zoom >= 16) {
            for (const point of group) {
              const marker = L.marker([point.lat, point.lng], {
                icon: L.divIcon({ className: "map-pin", html: `<span>${shortPrice(point.price)}</span>`, iconSize: [0, 0] }),
                riseOnHover: true, keyboard: true, title: `${point.label} · ${point.address}`,
              });
              marker.bindPopup(`<a class="map-card" href="/listing/${escape(point.slug)}">
                ${point.photo ? `<img src="${escape(point.photo)}" alt="" loading="lazy" />` : ""}
                <span><b>${escape(point.label)}</b><em>${escape(point.address)}</em>
                <small>${point.beds ?? "–"} bd · ${point.baths ?? "–"} ba</small><i>View home →</i></span></a>`,
                { closeButton: false, className: "map-popup", offset: [0, -34], maxWidth: 260, minWidth: 240 });
              marker.addTo(layer!);
              markers.current.set(point.id, marker);
            }
          } else {
            const lat = group.reduce((sum, point) => sum + point.lat, 0) / group.length;
            const lng = group.reduce((sum, point) => sum + point.lng, 0) / group.length;
            const from = Math.min(...group.map(point => point.price));
            const size = group.length >= 100 ? "lg" : group.length >= 20 ? "md" : "sm";
            const cluster = L.marker([lat, lng], {
              icon: L.divIcon({ className: `map-cluster ${size}`, html: `<span><b>${count.format(group.length)}</b><small>from ${shortPrice(from)}</small></span>`, iconSize: [0, 0] }),
              title: `${group.length} homes — zoom in`, keyboard: true,
            });
            cluster.on("click", () => instance.fitBounds(L.latLngBounds(group.map(point => [point.lat, point.lng])), { padding: [60, 60], maxZoom: 17 }));
            cluster.addTo(layer!);
          }
        }
      };

      // First view: the searched area, else all pins, else all of Canada.
      programmatic.current = true;
      const area = bounds?.split(",").map(Number);
      if (area?.length === 4 && area.every(Number.isFinite)) instance.fitBounds([[area[0], area[1]], [area[2], area[3]]] as LatLngBoundsExpression);
      else if (points.length) {
        // Frame where most homes are (5th–95th percentile), so a few far-away listings don't zoom the map out.
        const pick = (values: number[], q: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1))))];
        const lats = points.map(point => point.lat).sort((x, y) => x - y), lngs = points.map(point => point.lng).sort((x, y) => x - y);
        instance.fitBounds([[pick(lats, 0.05), pick(lngs, 0.05)], [pick(lats, 0.95), pick(lngs, 0.95)]], { padding: [20, 20], maxZoom: 14 });
      }
      draw();
      // A pop-up's auto-pan must not redraw (that would remove the pop-up it just opened).
      let popupOpen = false;
      const onPopupOpen = () => { popupOpen = true; };
      const onPopupClose = () => { popupOpen = false; };
      const onMove = () => { if (!popupOpen) draw(); };
      instance.on("popupopen", onPopupOpen).on("popupclose", onPopupClose).on("zoomend", draw).on("moveend", onMove);
      redraw = () => instance.off("popupopen", onPopupOpen).off("popupclose", onPopupClose).off("zoomend", draw).off("moveend", onMove);
    });

    return () => {
      disposed = true;
      redraw?.();
      layer?.remove();
    };
  }, [ready, points, bounds]);

  // Highlight the pin of the hovered card.
  useEffect(() => {
    const marker = hoveredId ? markers.current.get(hoveredId) : undefined;
    const pin = marker?.getElement();
    pin?.classList.add("is-hot");
    marker?.setZIndexOffset(1000);
    return () => { pin?.classList.remove("is-hot"); marker?.setZIndexOffset(0); };
  }, [hoveredId, points]);

  const searchArea = () => {
    const instance = map.current;
    if (!instance) return;
    const b = instance.getBounds();
    const params = new URLSearchParams(query);
    params.set("bounds", [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(value => value.toFixed(5)).join(","));
    params.set("view", "map");
    setMoved(false);
    router.push(`/search?${params}#listing-results`, { scroll: false });
  };

  return <div className="listings-map">
    <div ref={element} className="listings-map-canvas" role="application" aria-label="Map of homes for sale in this search" />
    {moved && <button type="button" className="map-search-area" onClick={searchArea}>Search this area</button>}
    <p className="map-status" aria-live="polite">
      {points === null ? "Loading map…" : total > points.length ? `Showing the ${count.format(points.length)} newest of ${count.format(total)} homes · zoom in for more detail` : `${count.format(total)} ${total === 1 ? "home" : "homes"} on the map`}
    </p>
  </div>;
}
