/*
  Brandfetch favicons for promotional/brand email senders — ports native
  BrandfetchService. The Brandfetch CDN wants the registrable APEX domain
  (e.g. `email.cnn.com` → `cnn.com`, `info@email.jumia.com.eg` → `jumia.com.eg`),
  NOT the mail subdomain — which is why Google's s2/favicons returned a generic
  globe for `mail.cnn.com`. Falls back gracefully (the <img> error → gradient).
*/

const CLIENT_ID = "1idL0IDji31vq9GhqcH";
const CDN_BASE = "https://cdn.brandfetch.io";

// Second-level markers sitting in front of a 2-letter ccTLD (`com.eg`, `co.uk`).
const SECOND_LEVEL = new Set([
  "co", "com", "net", "org", "edu", "gov", "gob", "gouv", "ac", "or", "ne",
  "go", "mil", "gen", "ind", "asn", "id", "sch", "ltd", "plc", "me", "name",
  "info", "biz", "in",
]);

/** Index of the registrable "brand" label inside a dot-split domain. */
function brandLabelIndex(parts: string[]): number | null {
  if (parts.length < 2) return parts.length ? 0 : null;
  const tld = parts[parts.length - 1].toLowerCase();
  const isMultiPartSuffix =
    parts.length >= 3 &&
    tld.length === 2 &&
    SECOND_LEVEL.has(parts[parts.length - 2].toLowerCase());
  const suffixLen = isMultiPartSuffix ? 2 : 1;
  const brandIdx = parts.length - 1 - suffixLen;
  return brandIdx >= 0 ? brandIdx : null;
}

/** Registrable apex domain for an email address (mirrors native). */
export function apexDomain(address?: string): string | null {
  if (!address) return null;
  const at = address.split("@");
  if (at.length < 2 || !at[1]) return null;
  const local = at[0].toLowerCase();
  const domainParts = at[1].toLowerCase().split(".");
  const idx = brandLabelIndex(domainParts);
  if (idx == null) return null;
  let domain = domainParts.slice(idx).join(".");
  if (domain.includes("facebook") || local.includes("facebook"))
    domain = "facebook.com";
  return domain;
}

/** Brandfetch icon URL for a sender address, or undefined if unparseable. */
export function brandfetchFavicon(address?: string): string | undefined {
  const domain = apexDomain(address);
  return domain
    ? `${CDN_BASE}/${domain}/w/100/h/100?c=${CLIENT_ID}`
    : undefined;
}
