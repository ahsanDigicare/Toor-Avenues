import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Roboto } from "next/font/google";
import "./globals.css";
import { SiteEffects } from "./site-effects";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-heading", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-body", subsets: ["latin"] });
const inter = Inter({ variable: "--font-label", subsets: ["latin"] });

export const metadata: Metadata = { metadataBase: new URL(process.env.SITE_URL || "https://tooravenues.com"), title: "ToorAvenues | Calgary Homes for Sale & Real Estate", description: "Work with ToorAvenues and the Team of Outstanding REALTORS® for Calgary homes, professional selling strategies, buyer guidance, and personalized real estate support." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions (e.g. ColorZilla's cz-shortcut-listen, Grammarly, password managers) add
  // attributes to <html>/<body> before React loads. suppressHydrationWarning ignores those
  // attribute differences on these two elements only; mismatches deeper in the page still report.
  return <html lang="en" className={`${jakarta.variable} ${roboto.variable} ${inter.variable}`} suppressHydrationWarning>
    <body suppressHydrationWarning><SiteEffects />{children}</body>
  </html>;
}
