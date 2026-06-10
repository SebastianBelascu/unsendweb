"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, LogOut, UserPlus, X } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecipientInput, type Recipient } from "./RecipientInput";
import { useGroupActions } from "@/lib/api/threads";
import type { ThreadParticipant } from "@/lib/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const norm = (s?: string) => (s ?? "").toLowerCase();

/**
 * Group settings: rename, add/remove participants, leave. The backend replaces
 * the participant list wholesale, so every mutation sends the complete intended
 * set of email addresses (derived from the conversation's known members).
 */
export function GroupPanel({
  topicId,
  threadId,
  name,
  members,
  currentUserAddress,
  onRenamed,
  onClose,
}: {
  topicId: string;
  threadId?: string;
  name: string;
  members: ThreadParticipant[];
  currentUserAddress?: string;
  /** Called with the new name on a successful rename (header reflects instantly). */
  onRenamed?: (name: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { rename, setParticipants, leave } = useGroupActions(topicId, threadId);
  const [newName, setNewName] = useState(name);
  const [adding, setAdding] = useState<Recipient[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const memberAddrs = members
    .map((m) => m.address)
    .filter((a): a is string => Boolean(a));

  function commitRename() {
    const next = newName.trim();
    if (!next || next === name) return;
    rename.mutate(next, {
      onSuccess: () => {
        onRenamed?.(next);
        toast("Group renamed");
      },
      onError: () => toast("Couldn't rename group", "error"),
    });
  }

  function commitAdd() {
    if (!adding.length) return;
    const seen = new Set(memberAddrs.map(norm));
    const merged = [...memberAddrs];
    for (const r of adding) if (!seen.has(norm(r.address))) merged.push(r.address);
    setParticipants.mutate(merged, {
      onSuccess: () => {
        setAdding([]);
        toast("Added to group");
      },
      onError: () => toast("Couldn't add member", "error"),
    });
  }

  function removeMember(address: string) {
    setParticipants.mutate(
      memberAddrs.filter((a) => norm(a) !== norm(address)),
      { onSuccess: () => toast("Removed from group") },
    );
  }

  function doLeave() {
    leave.mutate(undefined, {
      onSuccess: () => {
        setConfirmLeave(false);
        onClose();
        router.push("/chat");
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-canvas shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="text-callout font-bold text-ink-strong">Group info</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-6 flex flex-col items-center gap-3">
            <UserAvatar
              name={name}
              people={members.map((m) => ({ name: m.name, address: m.address }))}
              isEmail={false}
              size={72}
              showBadge={false}
            />
          </div>

          {/* Rename */}
          <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-faint">
            Group name
          </label>
          <div className="mb-6 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-[42px] flex-1 rounded-lg border border-line-strong bg-canvas px-3 text-body text-ink-strong outline-none focus:border-muted"
            />
            <button
              type="button"
              onClick={commitRename}
              disabled={rename.isPending || !newName.trim() || newName.trim() === name}
              className="flex h-[42px] items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-footnote font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
            >
              {rename.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
          </div>

          {/* Add members */}
          <label className="mb-1 block text-caption font-semibold uppercase tracking-wide text-faint">
            Add people
          </label>
          <div className="mb-2 rounded-lg border border-line-strong">
            <RecipientInput label="Add" value={adding} onChange={setAdding} />
          </div>
          <button
            type="button"
            onClick={commitAdd}
            disabled={setParticipants.isPending || adding.length === 0}
            className="mb-6 flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-footnote font-semibold text-ink hover:bg-surface-3 disabled:opacity-50"
          >
            {setParticipants.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Add to group
          </button>

          {/* Members */}
          <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-faint">
            {members.length} member{members.length === 1 ? "" : "s"}
          </div>
          <div className="flex flex-col">
            {members.map((m) => {
              const isSelf = norm(m.address) === norm(currentUserAddress);
              return (
                <div
                  key={m.address || m.name}
                  className="flex items-center gap-3 py-2"
                >
                  <UserAvatar
                    name={m.name}
                    address={m.address}
                    isEmail={false}
                    size={36}
                    showBadge={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-subhead text-ink">
                      {m.name}
                      {isSelf && <span className="text-faint"> (You)</span>}
                    </div>
                    {m.address && (
                      <div className="truncate text-caption text-faint">
                        {m.address}
                      </div>
                    )}
                  </div>
                  {!isSelf && m.address && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.address as string)}
                      disabled={setParticipants.isPending}
                      className="rounded-md p-1.5 text-faint hover:bg-surface-3 hover:text-accent disabled:opacity-50"
                      aria-label={`Remove ${m.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <footer className="border-t border-line p-4">
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full border border-accent/40 px-4 py-2.5",
              "text-subhead font-semibold text-accent hover:bg-accent/10",
            )}
          >
            <LogOut className="h-4 w-4" /> Leave group
          </button>
        </footer>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        danger
        title="Leave group?"
        body="You'll stop receiving messages from this group."
        confirmLabel="Leave"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
