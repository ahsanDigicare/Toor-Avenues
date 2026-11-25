import Link from "next/link";
import { InnerPage } from "../../site-components";

// Shown when a listing has sold, expired or been withdrawn (it is no longer in the DDF® feed).
export default function ListingNotFound() {
  return <InnerPage><section className="listing-page shell listing-gone">
    <p className="section-label">LISTING NO LONGER AVAILABLE</p>
    <h1>This home is no longer on the market.</h1>
    <p>It may have sold, expired or been taken off the market. Search current listings across Canada, or ask our team about similar homes.</p>
    <div><Link className="button green" href="/search">Search homes for sale</Link><Link className="text-route-link" href="/contact">Talk with our team →</Link></div>
  </section></InnerPage>;
}
