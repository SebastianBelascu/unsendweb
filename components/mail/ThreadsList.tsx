import { ThreadCard } from "./ThreadCard";
import type { MailFilter, ThreadListItem } from "@/lib/types";

export function ThreadsList({
  threads,
  emptyLabel,
  filter,
  currentUsername,
  selecting = false,
  selectedIds,
  onToggleSelect,
}: {
  threads: ThreadListItem[];
  emptyLabel: string;
  filter?: MailFilter;
  currentUsername?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-faint">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {threads.map((t, i) => (
        <li key={t.id} className={i === 0 ? "" : "border-t border-line"}>
          <ThreadCard
            thread={t}
            filter={filter}
            currentUsername={currentUsername}
            selecting={selecting}
            selected={selectedIds?.has(t.id)}
            onToggleSelect={() => onToggleSelect?.(t.id)}
          />
        </li>
      ))}
    </ul>
  );
}
