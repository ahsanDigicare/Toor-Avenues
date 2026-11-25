"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ANY_PROVINCE, BATH_OPTIONS, BED_OPTIONS, MAX_PRICE_OPTIONS, MIN_PRICE_OPTIONS, PRICE_OPTIONS, PROVINCES } from "../lib/search-options";

type DropdownProps = { label: string; name: string; options: string[]; /** Submitted values (defaults to the labels). */ values?: string[] };

/**
 * Budget dropdown on the homepage. The selection lives in React state only and is
 * submitted through a hidden input, so the shown value can never disagree with
 * what gets searched.
 */
function BudgetDropdown({ label, name, options }: DropdownProps) {
  const [selected, setSelected] = useState(options[0]);
  const root = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  useOutsideClose(root);

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

/** Closes an open <details> dropdown when the visitor clicks anywhere else. */
function useOutsideClose(root: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) root.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [root]);
}

/**
 * Dropdown in the homepage search band (CITY, PRICE RANGE, BEDS, BATHS). Like the budget
 * dropdowns, the choice lives in React state and is sent through a hidden input; the
 * first option ("Any …") sends nothing.
 */
function SearchDropdown({ label, name, options, values = options }: DropdownProps) {
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  useOutsideClose(root);

  const choose = (index: number) => {
    setSelected(index);
    root.current?.removeAttribute("open");
    root.current?.querySelector("summary")?.focus();
  };

  return <div className="ed-search-dropdown">
    <span className="ed-search-dropdown-label">{label}</span>
    <details className="custom-select" ref={root} onKeyDown={event => {
      if (event.key === "Escape" && root.current?.open) { root.current.removeAttribute("open"); root.current.querySelector("summary")?.focus(); }
    }}>
      {selected > 0 && <input type="hidden" name={name} value={values[selected]} />}
      <summary className="custom-select-trigger" aria-label={`${label}: ${options[selected]}`} aria-controls={menuId}>
        <span className="custom-select-values"><span data-selected>{options[selected]}</span></span>
        <span className="select-chevron"><Image src="/assets/chevron.svg" alt="" width={12} height={12} /></span>
      </summary>
      <div className="custom-select-menu" id={menuId} role="listbox" aria-label={`${label} options`}>
        {options.map((option, index) => <button type="button" role="option" aria-selected={index === selected} key={option} onClick={() => choose(index)}>
          <span className="custom-select-option-content"><span>{option}</span></span>
        </button>)}
      </div>
    </details>
  </div>;
}

/**
 * Homepage search band (the original ToorAvenues design): province, city / community /
 * address (with suggestions of every city that has homes for sale), price, beds, baths.
 */
export default function EditorialSearch({ cities = [], provinces }: { cities?: string[]; provinces?: string[] }) {
  const listId = useId();
  // Only provinces with homes for sale are offered (all of them before the first sync).
  const shown = provinces?.length ? PROVINCES.filter(province => provinces.includes(province.name)) : PROVINCES;
  return <form className="ed-search" action="/search" autoComplete="off" role="search" aria-label="Search homes across Canada">
    <div className="ed-shell">
      <div className="ed-search-title"><h2>Search homes for sale across Canada</h2><Link href="/search?view=map#listing-results">Map view →</Link></div>
      <div className="ed-search-fields">
        <SearchDropdown label="PROVINCE" name="province" options={[ANY_PROVINCE, ...shown.map(p => p.name)]} values={["", ...shown.map(p => p.code)]} />
        <label className="wide"><span>CITY, COMMUNITY OR ADDRESS</span><input name="query" placeholder="Toronto, Kitsilano, 123 Main St…" list={listId} /></label>
        <datalist id={listId}>{cities.map(city => <option value={city} key={city} />)}</datalist>
        <SearchDropdown label="PRICE RANGE" name="price" options={PRICE_OPTIONS} />
        <SearchDropdown label="BEDS" name="beds" options={BED_OPTIONS} />
        <SearchDropdown label="BATHS" name="baths" options={BATH_OPTIONS} />
        <button className="ed-search-submit" type="submit">Search homes</button>
      </div>
      <div className="ed-search-foot"><Link href="/search?more=1#listing-results">+ More options</Link><Link href="#updates">Save your search &amp; get listing updates →</Link></div>
    </div>
  </form>;
}

export function BudgetRange() {
  return <form className="ed-range" action="/search" id="budget" autoComplete="off">
    <div><p className="ed-label">YOUR BUDGET</p><span>Choose your price range</span></div>
    <BudgetDropdown label="Minimum price" name="min" options={MIN_PRICE_OPTIONS} />
    <BudgetDropdown label="Maximum price" name="max" options={MAX_PRICE_OPTIONS} />
    <button type="submit">Apply range</button><Link href="/search">Reset</Link>
  </form>;
}
