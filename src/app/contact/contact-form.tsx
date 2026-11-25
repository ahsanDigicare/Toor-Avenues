// Contact form. Prefilled from links such as /contact?interest=showing&listing=A2359747
// (listing pages) and /contact?interest=home-value (Free Market Evaluation buttons).
// Delivery is still a mailto: placeholder until a lead-delivery service is chosen.
const INTERESTS = ["Buying a home", "Selling a home", "Home valuation", "Mortgage pre-approval", "General question"];
const INTEREST_ALIASES: Record<string, string> = { showing: "Buying a home", buy: "Buying a home", sell: "Selling a home", "home-value": "Home valuation", evaluation: "Home valuation", mortgage: "Mortgage pre-approval" };

export function ContactForm({ interest = "", listing = "" }: { interest?: string; listing?: string }) {
  const selected = INTEREST_ALIASES[interest.toLowerCase()] ?? (INTERESTS.includes(interest) ? interest : "");
  const mls = /^[A-Za-z0-9]{4,20}$/.test(listing) ? listing.toUpperCase() : "";
  const message = mls ? `I would like more information about MLS® ${mls}, and to book a showing.`
    : selected === "Home valuation" ? "I would like a free market evaluation of my home. The address is: " : "";
  return <form className="contact-form" action="mailto:info@tooravenues.com" method="post" encType="text/plain">
    <div><label>First name<input required name="firstName" autoComplete="given-name" /></label><label>Last name<input required name="lastName" autoComplete="family-name" /></label></div>
    <label>Email address<input required type="email" name="email" autoComplete="email" /></label>
    <label>Phone number<input type="tel" name="phone" autoComplete="tel" /></label>
    <label>I am interested in<select name="interest" defaultValue={selected}><option value="" disabled>Select one</option>{INTERESTS.map(option => <option key={option}>{option}</option>)}</select></label>
    {mls && <input type="hidden" name="listing" value={`MLS® ${mls}`} />}
    <label>How can we help?<textarea required name="message" rows={6} defaultValue={message} /></label>
    <button className="button green" type="submit">Send message</button>
    <small>This opens your email application. Secure CRM delivery will replace this temporary form before launch.</small>
  </form>;
}
