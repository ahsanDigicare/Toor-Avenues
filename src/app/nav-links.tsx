"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Main navigation that marks the current section ("you are here"). */
export function NavLinks({ links }: { links: readonly (readonly [string, string])[] }) {
  const pathname = usePathname();
  return <>{links.map(([label, href]) => {
    const current = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`) || (href === "/search" && pathname.startsWith("/listing"));
    return <Link href={href} key={href} aria-current={current ? "page" : undefined} className={current ? "is-current" : undefined}>{label}</Link>;
  })}</>;
}
