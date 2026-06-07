"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Composer } from "./Composer";
import { useComposeModal } from "@/lib/compose-modal";

/**
 * Single global host for the compose modal. Mounted once in the app layout;
 * any caller opens it via useComposeModal().open(...). Closed = nothing renders.
 */
export function ComposeModal() {
  const initial = useComposeModal((s) => s.initial);
  const close = useComposeModal((s) => s.close);

  return (
    <Sheet
      open={Boolean(initial)}
      onClose={close}
      side="center"
      className="h-[80vh] max-h-[85vh] max-w-xl"
    >
      {initial && (
        <Composer
          key={`${initial.mode}:${initial.threadId ?? initial.topicId ?? initial.to}`}
          initial={initial}
          onClose={close}
        />
      )}
    </Sheet>
  );
}
