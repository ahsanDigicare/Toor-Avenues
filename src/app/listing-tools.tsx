"use client";

import { PhotoCarousel } from "./photo-carousel";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Card photo carousel: the cover photo first; the full list is fetched as the card
// nears the screen. Built on the native scroll-snap PhotoCarousel.
// ---------------------------------------------------------------------------

type CardPhotosProps = { listingKey: string; photo: string; count: number; alt: string; sizes: string };

export function CardPhotos({ listingKey, photo, count, alt, sizes }: CardPhotosProps) {
  return <PhotoCarousel photos={[photo]} count={count} fetchKey={listingKey} alt={alt} sizes={sizes} />;
}

// ---------------------------------------------------------------------------
// Mortgage calculator (Canadian semi-annual compounding, CMHC insurance).
// ---------------------------------------------------------------------------

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

/** Minimum down payment under current federal rules (insured mortgages up to $1.5M). */
function minimumDown(price: number) {
  if (price >= 1_500_000) return price * 0.2;
  if (price <= 500_000) return price * 0.05;
  return 25_000 + (price - 500_000) * 0.1;
}

function cmhcRate(price: number, downPercent: number) {
  if (price >= 1_500_000 || downPercent >= 20) return 0;
  if (downPercent >= 15) return 0.028;
  if (downPercent >= 10) return 0.031;
  return 0.04;
}

type CalculatorProps = { price: number; annualTax: number | null; monthlyFee: number | null };

export function MortgageCalculator({ price: listPrice, annualTax, monthlyFee }: CalculatorProps) {
  const [price, setPrice] = useState(Math.round(listPrice));
  const [downPercent, setDownPercent] = useState(20);
  const [rate, setRate] = useState(4.5);
  const [years, setYears] = useState(25);

  const result = useMemo(() => {
    const down = Math.round(price * downPercent / 100);
    const minDown = minimumDown(price);
    const insurance = Math.round((price - down) * cmhcRate(price, downPercent));
    const loan = Math.max(0, price - down + insurance);
    const periodic = Math.pow(1 + rate / 100 / 2, 1 / 6) - 1;
    const months = years * 12;
    const payment = loan <= 0 ? 0 : periodic ? loan * periodic / (1 - Math.pow(1 + periodic, -months)) : loan / months;
    const tax = annualTax ? annualTax / 12 : 0;
    const fee = monthlyFee ?? 0;
    return { down, minDown, insurance, loan, payment, tax, fee, total: payment + tax + fee, belowMinimum: down < minDown - 1 };
  }, [price, downPercent, rate, years, annualTax, monthlyFee]);

  return <section className="listing-calculator" id="mortgage-calculator">
    <h2>Mortgage calculator</h2>
    <div className="listing-calculator-grid">
      <div className="listing-calculator-inputs">
        <label>Home price<input type="number" min={0} step={1000} value={price} onChange={event => setPrice(Math.max(0, Number(event.target.value)))} /></label>
        <label>Down payment <b>{downPercent}% · {money.format(result.down)}</b>
          <input type="range" min={5} max={50} step={1} value={downPercent} onChange={event => setDownPercent(Number(event.target.value))} />
        </label>
        <label>Interest rate (%)<input type="number" min={0} max={20} step={0.05} value={rate} onChange={event => setRate(Math.max(0, Number(event.target.value)))} /></label>
        <label>Amortization
          <select value={years} onChange={event => setYears(Number(event.target.value))}>{[15, 20, 25, 30].map(option => <option key={option} value={option}>{option} years</option>)}</select>
        </label>
      </div>
      <div className="listing-calculator-result">
        <span>Estimated mortgage payment</span>
        <strong>{money.format(result.payment)}<small> / month</small></strong>
        <dl>
          <div><dt>Down payment</dt><dd>{money.format(result.down)}</dd></div>
          {result.insurance > 0 && <div><dt>Mortgage insurance (CMHC)</dt><dd>{money.format(result.insurance)}</dd></div>}
          <div><dt>Total mortgage</dt><dd>{money.format(result.loan)}</dd></div>
          {result.tax > 0 && <div><dt>Property tax</dt><dd>{money.format(result.tax)} / mo</dd></div>}
          {result.fee > 0 && <div><dt>Condo / association fee</dt><dd>{money.format(result.fee)} / mo</dd></div>}
          <div className="total"><dt>Estimated monthly total</dt><dd>{money.format(result.total)}</dd></div>
        </dl>
        {result.belowMinimum && <p className="listing-calculator-warning">The minimum down payment for this price is {money.format(result.minDown)}.</p>}
      </div>
    </div>
    <p className="listing-calculator-note">Estimate only, using Canadian semi-annual compounding. Your rate, insurance and payment depend on your lender. Ask us for a mortgage broker referral.</p>
  </section>;
}
