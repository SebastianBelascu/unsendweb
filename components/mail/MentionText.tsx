"use client";

import type { ReactNode } from "react";
import type { MentionDto } from "@/lib/mentions";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * Message text with @mention spans rendered as highlighted chips (from the
 * structured mentions[] offset/length) and URLs linkified everywhere else.
 */
export function MentionText({
  text,
  mentions,
  isOwn,
}: {
  text: string;
  mentions?: MentionDto[];
  isOwn?: boolean;
}) {
  const valid = (mentions ?? [])
    .filter((m) => m.offset >= 0 && m.offset + m.length <= text.length)
    .sort((a, b) => a.offset - b.offset);

  if (valid.length === 0) {
    return (
      <span className="whitespace-pre-wrap break-words">
        <Linkified text={text} />
      </span>
    );
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  valid.forEach((m, idx) => {
    if (m.offset < cursor) return; // skip overlaps
    if (m.offset > cursor) {
      nodes.push(<Linkified key={`t${idx}`} text={text.slice(cursor, m.offset)} />);
    }
    nodes.push(
      <span
        key={`m${idx}`}
        className={cn("font-semibold", isOwn ? "text-white" : "text-accent")}
      >
        {text.slice(m.offset, m.offset + m.length)}
      </span>,
    );
    cursor = m.offset + m.length;
  });
  if (cursor < text.length) {
    nodes.push(<Linkified key="tend" text={text.slice(cursor)} />);
  }

  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}
