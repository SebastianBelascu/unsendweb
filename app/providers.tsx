"use client";

import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { installGlobalErrorHandlers } from "@/lib/observability";

/**
 * Client-side providers. Server entities flow through TanStack Query v5
 * (see context/10-state-and-realtime.md). React Context is not allowed in
 * Server Components, so this lives in a 'use client' boundary mounted in the
 * root layout.
 */
const CACHE_KEY = "unsend.web.qcache";
const MAX_AGE = 24 * 60 * 60 * 1000; // 1 day

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: MAX_AGE,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Capture uncaught errors / rejections app-wide (returns its own cleanup).
  useEffect(() => {
    return installGlobalErrorHandlers();
  }, []);

  // Offline-first: hydrate the cache from localStorage on mount, then persist
  // (debounced) on every cache change so a reload paints instantly from cache
  // and reads work briefly offline. Dependency-free (no persist plugin).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { t: number; state: unknown };
        if (Date.now() - parsed.t < MAX_AGE)
          hydrate(client, parsed.state as ReturnType<typeof dehydrate>);
      }
    } catch {
      /* corrupt cache — ignore */
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ t: Date.now(), state: dehydrate(client) }),
          );
        } catch {
          /* quota / serialization — skip */
        }
      }, 4000);
    };
    const unsub = client.getQueryCache().subscribe(persist);
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
