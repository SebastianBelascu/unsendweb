import { ThreadCard } from "./ThreadCard";
import type { MailFilter, ThreadListItem } from "@/lib/types";

export function ThreadsList({
  threads,
  emptyLabel,
  filter,
  currentUsername,
  activeId,
  selecting = false,
  selectedIds,
  onToggleSelect,
  tall = false,
}: {
  threads: ThreadListItem[];
  emptyLabel: string;
  filter?: MailFilter;
  currentUsername?: string;
  activeId?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  tall?: boolean;
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
      {threads.map((t) => (
        <li key={t.id}>
          <ThreadCard
            thread={t}
            filter={filter}
            currentUsername={currentUsername}
            active={t.id === activeId}
            selecting={selecting}
            selected={selectedIds?.has(t.id)}
            onToggleSelect={() => onToggleSelect?.(t.id)}
            tall={tall}
          />
        </li>
      ))}
    </ul>
  );
}
