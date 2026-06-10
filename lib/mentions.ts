/*
  @mention helpers. The composer surfaces a picker as you type `@token`; on
  send we re-derive the structured mentions[] by scanning the final text for
  `@<handle>` tokens that match a thread participant (or `@everyone`). This
  avoids fragile live offset-tracking in a plain <textarea> and is robust to
  manual edits. The backend resolves each user from `handle` when `userId` is
  null (mention.helpers.ts), so the web never needs participant userIds.
*/

export interface MentionParticipant {
  /** Handle without `@` (the address local-part / username). */
  username: string;
  name: string;
}

export interface MentionDto {
  userId?: string | null;
  handle: string;
  offset: number;
  length: number;
  type: "user" | "everyone";
}

// Chars allowed inside a handle token (mirrors username rules).
const TOKEN = /[A-Za-z0-9._-]/;

/**
 * The `@token` currently being typed at the caret, or null. A token starts at
 * an `@` that's at the start of the text or preceded by whitespace.
 */
export function activeMentionToken(
  text: string,
  caret: number,
): { token: string; start: number } | null {
  let i = caret - 1;
  while (i >= 0 && TOKEN.test(text[i])) i--;
  if (i < 0 || text[i] !== "@") return null;
  if (i > 0 && !/\s/.test(text[i - 1])) return null;
  return { token: text.slice(i + 1, caret), start: i };
}

/**
 * Replace the active `@token` (from `start` to `caret`) with `@handle ` and
 * return the new text + caret position.
 */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  handle: string,
): { text: string; caret: number } {
  const inserted = `@${handle} `;
  const next = text.slice(0, start) + inserted + text.slice(caret);
  return { text: next, caret: start + inserted.length };
}

/** Prefix-filtered participant rows for the picker (max 8). */
export function filterMentionParticipants(
  query: string,
  participants: MentionParticipant[],
): MentionParticipant[] {
  const q = query.toLowerCase();
  const list = q
    ? participants.filter(
        (p) =>
          p.username.toLowerCase().startsWith(q) ||
          p.name.toLowerCase().startsWith(q),
      )
    : participants;
  return list.slice(0, 8);
}

/** Whether the synthetic `@everyone` row shows for the current query. */
export function showEveryoneRow(
  query: string,
  supportsEveryone: boolean,
): boolean {
  if (!supportsEveryone) return false;
  const q = query.toLowerCase();
  return q === "" || "everyone".startsWith(q);
}

/**
 * Derive the structured mentions[] for a send by scanning `text` for
 * `@<handle>` spans matching a participant (type=user) or `@everyone`.
 */
export function buildMentions(
  text: string,
  participants: MentionParticipant[],
  supportsEveryone: boolean,
): MentionDto[] {
  const byUsername = new Map(
    participants.map((p) => [p.username.toLowerCase(), p.username]),
  );
  const out: MentionDto[] = [];
  const re = /(^|\s)@([A-Za-z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const handle = m[2];
    const offset = m.index + m[1].length; // index of the `@`
    const length = handle.length + 1;
    const lower = handle.toLowerCase();
    if (supportsEveryone && lower === "everyone") {
      out.push({ handle: "everyone", offset, length, type: "everyone" });
    } else if (byUsername.has(lower)) {
      out.push({
        userId: null,
        handle: byUsername.get(lower) as string,
        offset,
        length,
        type: "user",
      });
    }
  }
  return out;
}
