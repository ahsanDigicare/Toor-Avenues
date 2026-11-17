import type { Metadata } from "next";
import { PropertyExplorer, PropertySearch } from "../real-estate-tools";
import { InnerPage } from "../site-components";

export const metadata: Metadata = { title: "Search Calgary Homes for Sale | ToorAvenues", description: "Explore Calgary homes and prepare a personalized property search with the ToorAvenues team." };

export default function SearchPage() {
  return <InnerPage><section className="search-route-hero"><div className="shell"><p>CALGARY &amp; SURROUNDING AREAS</p><h1>Find a home that fits what comes next.</h1><span>Explore our current preview, then connect with our team to receive live listing matches and guided tours.</span></div><PropertySearch /></section>
    <section className="search-results-page shell"><div className="intro-grid"><p>FEATURED HOMES</p><div><h2>Start exploring Calgary real estate.</h2><span>These examples preview the search experience. Live IDX data will replace them before launch.</span></div></div><PropertyExplorer /></section></InnerPage>;
}
