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
  | "unread"
  | "groups"
  | "promotions"
  | "bookmarks"
  | "spam"
  | "deleted";

/** Left-rail destinations (icons live in NavRail). */
export const NAV_SECTIONS: { key: NavSection; label: string }[] = [
  { key: "all", label: "All" },
  { key: "chats", label: "Chats" },
  { key: "emails", label: "Emails" },
  { key: "calls", label: "Calls" },
  { key: "contacts", label: "Contacts" },
];

/** Filter chips shown on top of every list section (except calls). */
export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "groups", label: "Groups" },
  { key: "promotions", label: "Promotions" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "spam", label: "Spam" },
  { key: "deleted", label: "Deleted" },
];

/**
 * Promotional split: the "inbox" bucket (all / unread / groups / promotions) is
 * split so promo threads only show under "Promotions" (matches native's
 * separate Promo subscreen). Bookmarks/spam/deleted show everything.
 */
export function promoVisible(
  t: { isPromotional?: boolean },
  filter: InboxFilter,
  backendFilter: MailFilter,
): boolean {
  if (backendFilter !== "inbox") return true;
  return filter === "promotions"
    ? Boolean(t.isPromotional)
    : !t.isPromotional;
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
  return "inbox"; // all / unread / groups
}

/** Client-side predicate for the rail content type (chats vs emails vs all). */
export function sectionTypePredicate(
  s: NavSection,
): ((t: ThreadListItem) => boolean) | null {
  if (s === "chats") return (t) => !t.isEmail;
  if (s === "emails") return (t) => t.isEmail;
  return null; // all (calls is handled separately, has no thread list)
}

/** Client-side predicate for the chip bucket (unread/groups). */
export function filterPredicate(
  f: InboxFilter,
): ((t: ThreadListItem) => boolean) | null {
  if (f === "unread") return (t) => t.unread;
  if (f === "groups") return (t) => Boolean(t.isGroup);
  return null; // all / bookmarks / spam / deleted (bucket via backend filter)
}

export function sectionLabel(s: NavSection): string {
  return NAV_SECTIONS.find((x) => x.key === s)?.label ?? "All";
}
