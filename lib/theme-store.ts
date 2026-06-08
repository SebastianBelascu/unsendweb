import { create } from "zustand";

export type Theme = "dark" | "light";

const STORAGE_KEY = "unsend.theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / quota — non-fatal */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  /** Sync the store with the persisted theme (call once on mount). */
  init: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: "dark",
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  init: () => {
    if (typeof window === "undefined") return;
    let saved: Theme = "dark";
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "light" || s === "dark") saved = s;
    } catch {
      /* ignore */
    }
    applyTheme(saved);
    set({ theme: saved });
  },
}));
