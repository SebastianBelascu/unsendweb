/*
  Recently-used reactions, mirroring native RecentReactionsStore (max 12,
  most-recent-first, dedup on record). Persisted in localStorage. Reads happen
  in effects/handlers (not render) so React's purity rule isn't tripped.
*/

const KEY = "unsend.web.recentReactions";
const MAX = 12;

export function recentReactions(limit = MAX): string[] {
  if (typeof localStorage === "undefined" || limit <= 0) return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string").slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

export function recordReaction(emoji: string): void {
  if (typeof localStorage === "undefined" || !emoji) return;
  const next = [emoji, ...recentReactions(MAX).filter((e) => e !== emoji)].slice(
    0,
    MAX,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

/**
 * Native QuickReactRow: the default quick row, except slot 0 becomes your most
 * recent emoji when that emoji isn't already one of the defaults.
 */
export function quickReactionRow(defaults: string[]): string[] {
  const recent = recentReactions(1)[0];
  if (!recent || defaults.includes(recent)) return defaults;
  const row = [...defaults];
  row[0] = recent;
  return row;
}
