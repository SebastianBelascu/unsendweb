import { create } from "zustand";

/*
  Tiny toast store — single transient message at the bottom, auto-dismissed
  (~2.4s), mirroring the native UnsendToast. Call `toast("Copied")` from
  anywhere; <Toaster/> (mounted once at the shell) renders it.
*/

export interface ToastItem {
  id: number;
  message: string;
  tone: "default" | "error";
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, tone?: "default" | "error") => void;
  dismiss: () => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, tone = "default") => {
    if (timer) clearTimeout(timer);
    const id = ++seq;
    set({ current: { id, message, tone } });
    timer = setTimeout(() => {
      set((s) => (s.current?.id === id ? { current: null } : s));
    }, 2400);
  },
  dismiss: () => {
    if (timer) clearTimeout(timer);
    set({ current: null });
  },
}));

/** Imperative helper usable outside React (and inside). */
export function toast(message: string, tone?: "default" | "error") {
  useToastStore.getState().show(message, tone);
}
