// Notice shown wherever REALTOR.ca DDF® listing content appears.
// Confirm the final wording against the client's DDF® agreement and CREA's current
// trademark rules before launch (see README, "Before publishing").
export function DdfNotice({ className = "ddf-notice" }: { className?: string }) {
  return <p className={className}>
    Listing information is provided through the REALTOR.ca DDF® by The Canadian Real Estate Association (CREA) and the listing brokerages shown. It is deemed reliable but is not guaranteed, and listings may have sold, changed or been withdrawn since the last update. Photos are supplied by the listing brokerages.{" "}
    The trademarks REALTOR®, REALTORS®, and the REALTOR® logo are controlled by The Canadian Real Estate Association (CREA) and identify real estate professionals who are members of CREA. The trademarks MLS®, Multiple Listing Service® and the associated logos are owned by CREA and identify the quality of services provided by real estate professionals who are members of CREA. Used under licence.{" "}
    Powered by <a href="https://www.realtor.ca/" target="_blank" rel="noopener">REALTOR.ca</a>.
  </p>;
}
