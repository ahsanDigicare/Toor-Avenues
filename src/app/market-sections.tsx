import { CountUp } from "./count-up";
import type { MarketStats } from "../lib/listings";

// Shared building blocks for the Sell and Buy pages.

export function SectionHead({ label, title, copy, id }: { label: string; title: string; copy?: string; id?: string }) {
  return <div className="mk-head" id={id}>
    <p className="section-label">{label}</p>
    <h2>{title}</h2>
    {copy && <p>{copy}</p>}
  </div>;
}

/** Live market numbers pulled from the current MLS® listings. */
export function MarketStrip({ stats }: { stats: MarketStats | null }) {
  if (!stats || !stats.total) return null;
  return <section className="mk-strip shell" aria-label="Calgary-area market right now">
    <p><span className="cine-live" aria-hidden="true" />LIVE MARKET · UPDATED FROM MLS® LISTINGS</p>
    <dl>
      <div><dt>Homes for sale</dt><dd><CountUp value={stats.total} /></dd></div>
      <div><dt>New in the last 7 days</dt><dd><CountUp value={stats.fresh} /></dd></div>
      <div><dt>Typical asking price</dt><dd><CountUp value={Math.round(stats.medianPrice / 1000)} prefix="$" suffix="K" /></dd></div>
      <div><dt>Typical days on market</dt><dd><CountUp value={stats.medianDays} /></dd></div>
    </dl>
  </section>;
}

export type TimelineStep = { title: string; copy: string; time: string; icon: React.ReactNode };

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return <ol className="mk-timeline">
    {steps.map((step, index) => <li key={step.title} style={{ "--i": index } as React.CSSProperties}>
      <span className="mk-timeline-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{step.icon}</svg>
      </span>
      <div>
        <small>STEP {String(index + 1).padStart(2, "0")} · {step.time}</small>
        <h3>{step.title}</h3>
        <p>{step.copy}</p>
      </div>
    </li>)}
  </ol>;
}

export function Faq({ items }: { items: [question: string, answer: string][] }) {
  return <div className="mk-faq">
    {items.map(([question, answer]) => <details key={question}>
      <summary>{question}<span aria-hidden="true">+</span></summary>
      <p>{answer}</p>
    </details>)}
  </div>;
}

export const icons = {
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="m11 11 9-9M17 5l2 2M15 7l2 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3z" /><path d="M3 7V5h13v2M16 13h2" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  cube: <><path d="M12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  megaphone: <><path d="M3 10v4h4l8 5V5L7 10z" /><path d="M19 9a4 4 0 0 1 0 6" /></>,
  sign: <><path d="M5 21V4M5 5h12l-2 4 2 4H5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c.5-4 3.5-6 7-6s6.5 2 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.6 2.6 4 6" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  piggy: <><path d="M5 11a7 6 0 0 1 13-2h2v4l-2 1v4h-3v-2h-5v2H7v-3a6 6 0 0 1-2-4z" /><circle cx="15" cy="10" r=".8" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
};
