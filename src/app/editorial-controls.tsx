"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_PRICE_OPTIONS, MIN_PRICE_OPTIONS } from "../lib/search-options";

type DropdownProps = { label: string; name: string; options: string[] };

/**
 * Budget dropdown on the homepage. The selection lives in React state only and is
 * submitted through a hidden input, so the shown value can never disagree with
 * what gets searched.
 */
function BudgetDropdown({ label, name, options }: DropdownProps) {
  const [selected, setSelected] = useState(options[0]);
  const root = useRef<HTMLDetailsElement>(null);
  const menuId = useId();

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) root.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const choose = (option: string) => {
    setSelected(option);
    root.current?.removeAttribute("open");
    root.current?.querySelector("summary")?.focus();
  };

  return <details className="editorial-dropdown budget" ref={root} onKeyDown={event => {
    if (event.key === "Escape" && root.current?.open) { root.current.removeAttribute("open"); root.current.querySelector("summary")?.focus(); }
  }}>
    {/* Plain numbers in the URL ("No minimum" sends nothing). */}
    {/\d/.test(selected) && <input type="hidden" name={name} value={selected.replace(/\D/g, "")} />}
    <summary className="editorial-dropdown-trigger" aria-controls={menuId}>
      <span className="editorial-dropdown-label">{label}</span>
      <span className="editorial-dropdown-value"><span data-selected>{selected}</span></span>
      <i aria-hidden="true" />
    </summary>
    <div className="editorial-dropdown-menu" id={menuId} role="listbox" aria-label={`${label} options`}>
      {options.map(option => <button type="button" role="option" aria-selected={option === selected} data-selected={option === selected || undefined} key={option} onClick={() => choose(option)}>{option}</button>)}
    </div>
  </details>;
}

export function BudgetRange() {
  return <form className="ed-range" action="/search" id="budget" autoComplete="off">
    <div><p className="ed-label">YOUR BUDGET</p><span>Choose your price range</span></div>
    <BudgetDropdown label="Minimum price" name="min" options={MIN_PRICE_OPTIONS} />
    <BudgetDropdown label="Maximum price" name="max" options={MAX_PRICE_OPTIONS} />
    <button type="submit">Apply range</button><Link href="/search">Reset</Link>
  </form>;
}
