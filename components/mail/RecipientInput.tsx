"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Avatar } from "./Avatar";
import { searchUsers } from "@/lib/api/users";
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
}: {
  label: string;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  /** Email mode: allow arbitrary typed addresses, not just Unsend users. */
  allowFreeText?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const { data: results = [] } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  const suggestions = results.filter(
    (r) => !value.some((v) => v.address.toLowerCase() === r.address.toLowerCase()),
  );

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
      <span className="mt-1.5 w-12 shrink-0 text-[13px] text-faint">{label}</span>
      <div ref={boxRef} className="relative flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((r) => (
            <span
              key={r.address}
              className="flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pl-1 pr-2 text-[13px] text-ink"
            >
              <Avatar
                name={r.name ?? r.address}
                seed={r.address}
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
            className="min-w-[120px] flex-1 bg-transparent py-1 text-[15px] text-ink-strong outline-none placeholder:text-faint"
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
                <Avatar
                  name={r.name}
                  seed={r.address}
                  isEmail={false}
                  size={28}
                  showBadge={false}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">
                    {r.name}
                  </span>
                  <span className="block truncate text-[12px] text-faint">
                    @{r.username}
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
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-ink hover:bg-surface-3",
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
