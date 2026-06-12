"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { searchUsers, type UserResult } from "@/lib/api/users";
import { useContacts } from "@/lib/api/contacts";
import { localPart, MAIL_DOMAIN } from "@/lib/identity";
import { cn } from "@/lib/utils";

export interface Recipient {
  name?: string;
  address: string;
}

export function RecipientInput({
  label,
  value,
  onChange,
  allowFreeText = false,
  autoFocus = false,
  focusToken,
}: {
  label: string;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  /** Email mode: allow arbitrary typed addresses, not just Unsend users. */
  allowFreeText?: boolean;
  autoFocus?: boolean;
  /** Bump to re-focus the input (e.g. after the compose Chat/Email toggle, which
   *  otherwise moves focus to the toggle button — native `toFocusToken`). */
  focusToken?: number;
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-focus on token change (skips the initial 0/undefined so it doesn't fight
  // autoFocus or steal focus on first mount).
  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  // Your address book — surfaced as instant suggestions (like the native app),
  // so typing a contact's name/username/phone shows them with no round-trip.
  const { data: contacts = [] } = useContacts();
  // Broader platform search as a fallback for people not in your contacts.
  const { data: results = [] } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  const q = debounced.toLowerCase();
  const localMatches: UserResult[] =
    q.length >= 1
      ? contacts
          .filter(
            (c) =>
              // Chat compose suggests Unsend users only; email mode allows all.
              (allowFreeText ||
                c.address.toLowerCase().includes(MAIL_DOMAIN)) &&
              ((c.name || "").toLowerCase().includes(q) ||
                c.address.toLowerCase().includes(q) ||
                (c.phone || "").includes(q)),
          )
          .map((c) => ({
            name: c.name || localPart(c.address),
            username: localPart(c.address),
            address: c.address,
          }))
      : [];

  // Contacts first, then platform-search results; dedupe by address; drop any
  // already selected.
  const suggestions: UserResult[] = [];
  const seen = new Set(value.map((v) => v.address.toLowerCase()));
  for (const r of [...localMatches, ...results]) {
    const k = r.address.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    suggestions.push(r);
    if (suggestions.length >= 8) break;
  }

  function add(r: Recipient) {
    if (!value.some((v) => v.address.toLowerCase() === r.address.toLowerCase())) {
      onChange([...value, r]);
    }
    setText("");
    setDebounced("");
    setOpen(false);
  }

  function remove(address: string) {
    onChange(value.filter((v) => v.address !== address));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[0]) add(suggestions[0]);
      else if (allowFreeText && text.includes("@"))
        add({ address: text.trim() });
    } else if (e.key === "Backspace" && !text && value.length > 0) {
      remove(value[value.length - 1].address);
    }
  }

  const showFreeText =
    allowFreeText && text.includes("@") && !suggestions.length;

  return (
    <div className="relative flex items-start gap-3 border-b border-line px-6 py-3">
      <span className="mt-1.5 w-12 shrink-0 text-footnote text-faint">{label}</span>
      <div ref={boxRef} className="relative flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((r) => (
            <span
              key={r.address}
              className="flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pl-1 pr-2 text-footnote text-ink"
            >
              <UserAvatar
                name={r.name ?? r.address}
                address={r.address}
                isEmail
                size={18}
                showBadge={false}
              />
              <span className="max-w-[160px] truncate">{r.name ?? r.address}</span>
              <button
                type="button"
                onClick={() => remove(r.address)}
                className="text-faint hover:text-ink"
                aria-label={`Remove ${r.name ?? r.address}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={value.length === 0 ? "Search people…" : ""}
            className={cn(
              // Stretch only when there are no chips (so the placeholder/typing
              // has room); once chips exist, the input sits snug after them
              // instead of a big empty field filling the row.
              "min-w-[80px] bg-transparent py-1 text-body text-ink-strong outline-none placeholder:text-faint",
              value.length === 0 && "flex-1",
            )}
          />
        </div>

        {open && (suggestions.length > 0 || showFreeText) && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line-strong bg-surface-2 py-1 shadow-lg">
            {suggestions.map((r) => (
              <button
                key={r.address}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(r)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-3"
              >
                <UserAvatar
                  name={r.name}
                  address={r.address}
                  isEmail={allowFreeText}
                  size={28}
                  showBadge={false}
                />
                <span className="min-w-0">
                  <span className="block truncate text-subhead text-ink">
                    {r.name}
                  </span>
                  <span className="block truncate text-caption text-faint">
                    {/* Email compose → show the full address; chat → @username. */}
                    {allowFreeText ? r.address : `@${r.username}`}
                  </span>
                </span>
              </button>
            ))}
            {showFreeText && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add({ address: text.trim() })}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-subhead text-ink hover:bg-surface-3",
                  suggestions.length > 0 && "border-t border-line",
                )}
              >
                Add <span className="font-semibold">{text.trim()}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
