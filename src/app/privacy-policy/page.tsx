import type { Metadata } from "next";
import { InnerPage } from "../site-components";

export const metadata: Metadata = {
  title: "Privacy Policy | ToorAvenues",
  description: "How ToorAvenues collects, uses and protects the personal information you share with us.",
  alternates: { canonical: "/privacy-policy" },
};

// Content carried over from the previous tooravenues.com privacy policy. Section 6 adds the
// CREA DDF® listing analytics used by this site; have the client review before launch.
const sections: [string, React.ReactNode][] = [
  ["1. Information we collect", <>
    <p><b>Information you give us.</b> When you fill in a form, call, email or message us, we may collect:</p>
    <ul><li>your name, email address and phone number;</li><li>details about a property, such as its address and features, when you ask for a free home evaluation;</li><li>the listing and MLS® number you ask about when you request information or a showing;</li><li>what you are looking for, such as budget, communities, home type and timeline;</li><li>anything else you choose to include in your message.</li></ul>
    <p><b>Information collected automatically.</b> Like most websites, our Website and hosting provider automatically record technical information such as your IP address, browser type, device, pages viewed and the date and time of your visit. We may use cookies and similar tools to keep the Website working, remember your preferences and understand how the Website is used.</p>
  </>],
  ["2. How we use your information", <ul key="use"><li>to answer your questions and requests, and to arrange showings and consultations;</li><li>to prepare a home evaluation or market analysis you asked for;</li><li>to provide real estate services if you choose to work with us;</li><li>to send you listings or market updates you asked for (you can unsubscribe at any time);</li><li>to keep the Website secure, prevent spam and abuse, and improve the Website;</li><li>to meet our legal, regulatory and brokerage record-keeping obligations.</li></ul>],
  ["", <p key="sell">We do not sell or rent your personal information.</p>],
  ["3. Consent", <p key="consent">By submitting a form or contacting us, you agree that we may use your information for the purposes above. We will not send you commercial electronic messages without your consent, in line with Canada’s Anti-Spam Legislation (CASL). You can withdraw your consent at any time by emailing info@tooravenues.com, subject to legal or contractual limits.</p>],
  ["4. When we share information", <>
    <p>We share personal information only when needed to serve you or when the law requires it, for example with:</p>
    <ul><li>our brokerages (eXp Realty and LPT Realty), as required for regulated real estate services;</li><li>service providers who help us run the Website and our business, such as hosting, email and form tools, under confidentiality obligations;</li><li>other parties to a transaction, such as lenders, lawyers, inspectors or other REALTORS®, only with your direction or consent;</li><li>regulators, courts or authorities where required by law.</li></ul>
    <p>Some service providers may store or process information outside Alberta or Canada. In that case, the information may be subject to the laws of that place.</p>
  </>],
  ["5. Listing data", <p key="listing">Property listings on the Website are provided through the CREA DDF® (Data Distribution Facility) and are considered reliable but not guaranteed. REALTOR®, REALTORS®, MLS®, Multiple Listing Service® and the associated logos are trademarks controlled by The Canadian Real Estate Association (CREA). When you open a listing, third-party content such as photos, maps or virtual tours may load from other services that have their own privacy policies.</p>],
  ["6. Cookies and analytics", <>
    <p>You can set your browser to block or delete cookies. Some parts of the Website may not work properly if you do. If we use analytics tools, such as Google Analytics, they collect information about how visitors use the Website in aggregate form, and you can opt out using the tools those providers offer.</p>
    <p>When you view a listing, the Website reports the view to CREA’s listing analytics service so that listing brokerages can see where their listings are viewed. To do this, we set a cookie with a random identifier for your browser. We do not send your name, contact details or IP address with these reports.</p>
  </>],
  ["7. How long we keep information", <p key="keep">We keep personal information only as long as needed for the purposes above, or as long as the law, RECA rules or our brokerages require. After that we delete it or make it anonymous.</p>],
  ["8. How we protect information", <p key="protect">We use reasonable physical, technical and administrative safeguards, such as secure (HTTPS) connections, access controls and spam protection on our forms. No method of sending or storing information online is completely secure, so we cannot guarantee absolute security.</p>],
  ["9. Your rights", <p key="rights">You can ask to see the personal information we hold about you, ask us to correct it, or ask us to delete it where the law allows. To make a request, email info@tooravenues.com. If you are not satisfied with our response, you may contact the Office of the Information and Privacy Commissioner of Alberta.</p>],
  ["10. Links to other websites", <p key="links">The Website may link to other websites, such as REALTOR.ca, social media or mortgage resources. We are not responsible for the privacy practices of those websites.</p>],
  ["11. Children", <p key="children">The Website is not directed to children, and we do not knowingly collect personal information from children.</p>],
  ["12. Changes to this policy", <p key="changes">We may update this Privacy Policy from time to time. The “Last updated” date at the top shows when it last changed.</p>],
  ["13. Contact us", <p key="contact">ToorAvenues<br />#700 – 1816 Crowchild Trail NW, Calgary, AB T2M 3Y7<br />Phone: <a href="tel:4039264000">403-926-4000</a><br />Email: <a href="mailto:info@tooravenues.com">info@tooravenues.com</a></p>],
];

export default function PrivacyPolicyPage() {
  return <InnerPage><article className="legal-page shell">
    <p className="section-label">PRIVACY POLICY</p>
    <h1>Privacy Policy</h1>
    <p className="legal-lead">How we collect, use and protect the personal information you share with us.</p>
    <p className="legal-updated">Last updated: November 25, 2026</p>
    <p>ToorAvenues (“ToorAvenues”, “we”, “us” or “our”) is a Calgary real estate team made up of Davinder Toor, REALTOR® with eXp Realty, and Eknoor Toor, REALTOR® with LPT Realty. ToorAvenues is a team name, not a brokerage. This Privacy Policy explains how we collect, use, share and protect personal information when you visit tooravenues.com (the “Website”) or contact us.</p>
    <p>We handle personal information in line with Alberta’s Personal Information Protection Act (PIPA), Canada’s Personal Information Protection and Electronic Documents Act (PIPEDA) where it applies, and the rules of the Real Estate Council of Alberta (RECA).</p>
    {sections.map(([title, body], index) => <section key={title || index}>{title && <h2>{title}</h2>}{body}</section>)}
  </article></InnerPage>;
}
