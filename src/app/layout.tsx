import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Roboto } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-heading", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-body", subsets: ["latin"] });
const inter = Inter({ variable: "--font-label", subsets: ["latin"] });

export const metadata: Metadata = { title: "ToorAvenues | Calgary Homes for Sale & Real Estate", description: "Work with ToorAvenues and the Team of Outstanding REALTORS® for Calgary homes, professional selling strategies, buyer guidance, and personalized real estate support." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${jakarta.variable} ${roboto.variable} ${inter.variable}`}><body>{children}</body></html>;
}
