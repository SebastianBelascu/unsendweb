import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe (server snapshot is `false`) and
 * uses useSyncExternalStore so there's no set-state-in-effect. Example:
 * `const narrow = useMediaQuery("(max-width: 640px)")`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
