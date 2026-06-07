import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface TypingPerson {
  name: string;
  exp: number;
}

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
  /** username(lowercased) -> online */
  online: Record<string, boolean>;
  /** username(lowercased) -> ISO last-seen */
  lastSeen: Record<string, string>;
  /** topicId -> userId -> typing person */
  typing: Record<string, Record<string, TypingPerson>>;
  /** username(lowercased) -> avatar version (cache-busting) */
  avatarVersions: Record<string, number>;

  setSocket: (s: Socket | null) => void;
  setConnected: (c: boolean) => void;
  setOnline: (username: string, online: boolean, lastSeenAt?: string) => void;
  mergeSeed: (online: string[], lastSeen: Record<string, string>) => void;
  addTyping: (channel: string, userId: string, name: string) => void;
  removeTyping: (channel: string, userId: string) => void;
  pruneTyping: () => void;
  setAvatarVersion: (username: string, version: number) => void;
  mergeAvatarVersions: (
    changes: { username: string; version: number }[],
  ) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  socket: null,
  connected: false,
  online: {},
  lastSeen: {},
  typing: {},
  avatarVersions: {},

  setSocket: (socket) => set({ socket }),
  setConnected: (connected) =>
    set(connected ? { connected } : { connected, online: {} }),

  setOnline: (username, online, lastSeenAt) =>
    set((s) => {
      const u = username.toLowerCase();
      return {
        online: { ...s.online, [u]: online },
        lastSeen: lastSeenAt ? { ...s.lastSeen, [u]: lastSeenAt } : s.lastSeen,
      };
    }),

  mergeSeed: (onlineArr, lastSeen) =>
    set((s) => {
      const online = { ...s.online };
      for (const u of onlineArr) online[u.toLowerCase()] = true;
      const ls = { ...s.lastSeen };
      for (const [k, v] of Object.entries(lastSeen)) ls[k.toLowerCase()] = v;
      return { online, lastSeen: ls };
    }),

  addTyping: (channel, userId, name) =>
    set((s) => ({
      typing: {
        ...s.typing,
        [channel]: {
          ...(s.typing[channel] ?? {}),
          [userId]: { name, exp: Date.now() + 4000 },
        },
      },
    })),

  removeTyping: (channel, userId) =>
    set((s) => {
      const ch = { ...(s.typing[channel] ?? {}) };
      delete ch[userId];
      return { typing: { ...s.typing, [channel]: ch } };
    }),

  pruneTyping: () =>
    set((s) => {
      const now = Date.now();
      let changed = false;
      const next: RealtimeState["typing"] = {};
      for (const [channel, people] of Object.entries(s.typing)) {
        const kept: Record<string, TypingPerson> = {};
        for (const [uid, p] of Object.entries(people)) {
          if (p.exp > now) kept[uid] = p;
          else changed = true;
        }
        if (Object.keys(kept).length) next[channel] = kept;
      }
      return changed ? { typing: next } : {};
    }),

  setAvatarVersion: (username, version) =>
    set((s) => {
      const u = username.toLowerCase();
      if (s.avatarVersions[u] === version) return {};
      return { avatarVersions: { ...s.avatarVersions, [u]: version } };
    }),

  mergeAvatarVersions: (changes) =>
    set((s) => {
      const next = { ...s.avatarVersions };
      for (const c of changes) {
        if (c?.username && c.version) next[c.username.toLowerCase()] = c.version;
      }
      return { avatarVersions: next };
    }),
}));
