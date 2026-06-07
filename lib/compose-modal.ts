import { create } from "zustand";
import type { ComposerInitial } from "@/components/mail/Composer";

/**
 * Global compose modal. Any button (new message, forward, contact support) calls
 * `open(...)` with a partial initial; the single <ComposeModal/> host renders the
 * Composer in a centered modal over the current screen instead of navigating to
 * a full page.
 */
interface ComposeModalState {
  initial: ComposerInitial | null;
  open: (initial: Partial<ComposerInitial>) => void;
  close: () => void;
}

const DEFAULTS: ComposerInitial = {
  mode: "new",
  to: "",
  cc: "",
  subject: "",
  body: "",
  isEmail: true,
};

export const useComposeModal = create<ComposeModalState>((set) => ({
  initial: null,
  open: (initial) => set({ initial: { ...DEFAULTS, ...initial } }),
  close: () => set({ initial: null }),
}));
