import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Roboto } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-heading", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-body", subsets: ["latin"] });
const inter = Inter({ variable: "--font-label", subsets: ["latin"] });

export const metadata: Metadata = { title: "ToorAvenues | Calgary Real Estate", description: "Sell with confidence and buy with peace of mind with your local Calgary real estate team." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${jakarta.variable} ${roboto.variable} ${inter.variable}`}><body>{children}</body></html>;
}
