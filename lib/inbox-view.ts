import type { MailFilter, ThreadListItem } from "./types";

/**
 * Two-axis navigation:
 * - `NavSection` (left rail) = the content TYPE you're looking at.
 * - `InboxFilter` (top chips) = the BUCKET/filter applied within that type.
 * They compose: e.g. rail "Emails" + chip "Bookmarks" = bookmarked emails.
 */
export type NavSection = "all" | "chats" | "emails" | "calls" | "contacts";
export type InboxFilter =
  | "all"
  | "promotions"
  | "bookmarks"
  | "spam"
  | "deleted";

/** Call-history filter (calls section only — its own dimension, no buckets). */
export type CallFilter = "all" | "incoming" | "outgoing" | "missed";

/** Left-rail destinations (icons live in NavRail). */
export const NAV_SECTIONS: { key: NavSection; label: string }[] = [
  { key: "all", label: "All" },
  { key: "chats", label: "Chats" },
  { key: "emails", label: "Emails" },
  { key: "calls", label: "Calls" },
  { key: "contacts", label: "Contacts" },
];

/** Every filter chip (used for URL validation). Per-section subset below. */
export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "promotions", label: "Promotions" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "spam", label: "Spam" },
  { key: "deleted", label: "Deleted" },
];

// No "all" chip — the unfiltered view IS "all"; selecting a chip filters, and
// its X (active state) clears back to "all".
export const CALL_FILTERS: { key: CallFilter; label: string }[] = [
  { key: "incoming", label: "Incoming" },
  { key: "outgoing", label: "Outgoing" },
  { key: "missed", label: "Missed" },
];

/**
 * Chips shown per section (no "All" — deselect via the chip's X): chats only
 * carry Bookmarks/Deleted (no promo/spam, which are email concepts); All +
 * Emails carry the full set.
 */
export function filtersForSection(
  section: NavSection,
): { key: InboxFilter; label: string }[] {
  const buckets = INBOX_FILTERS.filter((f) => f.key !== "all");
  if (section === "chats")
    return buckets.filter(
      (f) => f.key === "bookmarks" || f.key === "deleted",
    );
  return buckets;
}

/**
 * Promotional handling: ONLY the "Promotions" filter restricts to promo threads.
 * The main inbox ("all") shows EVERYTHING, promo included — native's Inbox tab
 * has `excludePromotional = false` (only its separate "Primary" subscreen drops
 * promo). The previous behavior hid promo from the main inbox, which emptied it
 * whenever the backend flagged threads promotional.
 */
export function promoVisible(
  t: { isPromotional?: boolean },
  filter: InboxFilter,
  backendFilter: MailFilter,
): boolean {
  if (backendFilter === "inbox" && filter === "promotions")
    return Boolean(t.isPromotional);
  return true;
}

export function normalizeSection(v: string | null | undefined): NavSection {
  return v && NAV_SECTIONS.some((s) => s.key === v) ? (v as NavSection) : "all";
}

export function normalizeFilter(v: string | null | undefined): InboxFilter {
  return v && INBOX_FILTERS.some((f) => f.key === v)
    ? (v as InboxFilter)
    : "all";
}

/** Backend thread query for a chip bucket (bookmarks/spam/deleted, else inbox). */
export function filterBackendFilter(f: InboxFilter): MailFilter {
  if (f === "bookmarks") return "bookmarks";
  if (f === "spam") return "spam";
  if (f === "deleted") return "deleted";
  return "inbox"; // all / promotions
}

/** Client-side predicate for the rail content type (chats vs emails vs all). */
export function sectionTypePredicate(
  s: NavSection,
): ((t: ThreadListItem) => boolean) | null {
  if (s === "chats") return (t) => !t.isEmail;
  if (s === "emails") return (t) => t.isEmail;
  return null; // all (calls is handled separately, has no thread list)
}

export function sectionLabel(s: NavSection): string {
  return NAV_SECTIONS.find((x) => x.key === s)?.label ?? "All";
}
