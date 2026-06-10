import { create } from "zustand";

/*
  Ephemeral call state (one active call at a time). Durable entities (history)
  live in TanStack Query; this store is only the live call + incoming ring.
  State machine mirrors context/08-feature-calls.md §5.
*/

export type CallStatus =
  | "idle"
  | "calling" // outgoing: dialing
  | "ringing" // outgoing: receiver's device acked
  | "connecting" // receiver: answered, joining Agora
  | "joined"; // active — a remote peer is on the channel, media flowing

/** A participant in the call roster (used to label tiles + map Agora uids). */
export interface CallRosterEntry {
  name: string;
  address?: string;
}

export interface ActiveCall {
  uuid: string;
  channelName: string;
  topicId: string;
  isVideo: boolean;
  /** Other party (1:1 display). */
  peerName: string;
  peerAddress?: string;
  isGroup: boolean;
  groupName?: string;
  /** Full participant roster (groups) — maps Agora uids → names. */
  roster: CallRosterEntry[];
  /** true = we placed the call; false = we answered. */
  outgoing: boolean;
}

export interface IncomingCall {
  uuid: string;
  channelName: string;
  topicId: string;
  isVideo: boolean;
  callerName: string;
  callerAddress?: string;
  isGroup?: boolean;
  groupName?: string;
}

export interface RemotePeer {
  uid: number;
  hasVideo: boolean;
  muted: boolean;
  /** This peer is a screen-share stream (rendered large), not a camera. */
  isScreen?: boolean;
}

interface CallState {
  status: CallStatus;
  call: ActiveCall | null;
  incoming: IncomingCall | null;
  localMuted: boolean;
  localVideoOn: boolean;
  localScreenOn: boolean;
  /** Collapsed to the floating widget (native AppState.isCallMinimized). */
  minimized: boolean;
  /** Epoch ms when the call connected — drives a duration that survives minimize. */
  joinedAt: number | null;
  /** A peer turned their camera on and is inviting us to do the same. */
  cameraInvite: boolean;
  peers: Record<number, RemotePeer>;
  error: string | null;

  setStatus: (s: CallStatus) => void;
  setMinimized: (m: boolean) => void;
  setCameraInvite: (v: boolean) => void;
  /** Begin an outgoing call (status → calling). */
  startOutgoing: (call: ActiveCall) => void;
  /** Begin a call we answered (status → connecting). */
  startAnswered: (call: ActiveCall) => void;
  setIncoming: (i: IncomingCall | null) => void;
  setLocalMuted: (m: boolean) => void;
  setLocalVideoOn: (v: boolean) => void;
  setLocalScreenOn: (v: boolean) => void;
  upsertPeer: (uid: number, patch?: Partial<Omit<RemotePeer, "uid">>) => void;
  removePeer: (uid: number) => void;
  setError: (e: string | null) => void;
  /** Tear down to idle (keeps `incoming` untouched). */
  reset: () => void;
}

export const useCall = create<CallState>((set) => ({
  status: "idle",
  call: null,
  incoming: null,
  localMuted: false,
  localVideoOn: false,
  localScreenOn: false,
  minimized: false,
  joinedAt: null,
  cameraInvite: false,
  peers: {},
  error: null,

  // Stamp the connect time the first time we reach "joined"; the duration reads
  // from it so minimize/restore (which remounts the timer) stays accurate.
  setStatus: (status) =>
    set((s) => ({
      status,
      joinedAt:
        status === "joined" ? s.joinedAt ?? Date.now() : s.joinedAt,
    })),
  setMinimized: (minimized) => set({ minimized }),
  setCameraInvite: (cameraInvite) => set({ cameraInvite }),
  startOutgoing: (call) =>
    set({
      call,
      status: "calling",
      localMuted: false,
      localVideoOn: call.isVideo,
      localScreenOn: false,
      minimized: false,
      joinedAt: null,
      cameraInvite: false,
      peers: {},
      error: null,
    }),
  startAnswered: (call) =>
    set({
      call,
      incoming: null,
      status: "connecting",
      localMuted: false,
      localVideoOn: call.isVideo,
      localScreenOn: false,
      minimized: false,
      joinedAt: null,
      cameraInvite: false,
      peers: {},
      error: null,
    }),
  setIncoming: (incoming) => set({ incoming }),
  setLocalMuted: (localMuted) => set({ localMuted }),
  setLocalVideoOn: (localVideoOn) => set({ localVideoOn }),
  setLocalScreenOn: (localScreenOn) => set({ localScreenOn }),
  upsertPeer: (uid, patch) =>
    set((s) => {
      const existing: RemotePeer = s.peers[uid] ?? {
        uid,
        hasVideo: false,
        muted: false,
      };
      return { peers: { ...s.peers, [uid]: { ...existing, ...patch, uid } } };
    }),
  removePeer: (uid) =>
    set((s) => {
      if (!s.peers[uid]) return {};
      const next = { ...s.peers };
      delete next[uid];
      return { peers: next };
    }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      status: "idle",
      call: null,
      localMuted: false,
      localVideoOn: false,
      localScreenOn: false,
      minimized: false,
      joinedAt: null,
      cameraInvite: false,
      peers: {},
      error: null,
    }),
}));
