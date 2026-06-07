import { agora } from "./AgoraService";
import { useCall, type ActiveCall } from "./store";
import { generateAgoraUid } from "./agoraUid";
import { useRealtime } from "../realtime/store";
import { startCall as apiStartCall } from "../api/calls";
import { ApiError } from "../api/http";

/*
  Imperative call actions shared by the UI (CallButtons, IncomingCallModal,
  CallScreen) and the orchestrator (CallHost). Plain functions (not hooks) using
  store.getState() + the socket from the realtime store + the Agora singleton.
*/

function sock() {
  return useRealtime.getState().socket;
}

function callError(e: unknown): string {
  if (e instanceof ApiError) {
    const m = (e.data as { message?: string | string[] } | undefined)?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return "Call failed.";
}

// Guards a single teardown when local hang-up and remote `call-ended` race.
let tearingDown = false;

/**
 * Bind the Agora media callbacks right before each join. Done per-call (not once
 * at mount) so a previous `agora.leave()` clearing the handlers can never leave a
 * later call stuck — without this, media + audio still flow but the status never
 * advances past "calling" (onFirstRemoteJoined was a no-op).
 */
function bindHandlers(callerId?: string) {
  agora.setHandlers({
    onFirstRemoteJoined: () => {
      const st = useCall.getState();
      if (st.call) sock()?.emit("call-started", st.call.uuid);
      st.setStatus("joined");
    },
    onAllRemotesLeft: () => {
      void endCall();
    },
    onError: (msg) => {
      useCall.getState().setError(msg);
      void teardown();
    },
    onTokenWillExpire: () => {
      if (callerId) void renewCallToken(callerId);
    },
  });
}

export async function placeCall(opts: {
  topicId?: string;
  recipientUsername?: string;
  isVideo: boolean;
  peerName: string;
  peerAddress?: string;
  callerId: string;
}): Promise<void> {
  tearingDown = false;
  const store = useCall.getState();
  try {
    const res = await apiStartCall({
      topicId: opts.topicId,
      recipientUsername: opts.recipientUsername,
      isVideoCall: opts.isVideo,
      callerId: opts.callerId,
    });
    const call: ActiveCall = {
      uuid: res.uuid,
      channelName: res.channelName,
      topicId: res.topicId,
      isVideo: res.isVideoCall,
      peerName: opts.peerName,
      peerAddress: opts.peerAddress,
      isGroup: res.isGroup,
      groupName: res.groupName,
      outgoing: true,
    };
    store.startOutgoing(call);
    bindHandlers(opts.callerId);
    sock()?.emit("join", res.channelName);
    await agora.join({
      channelName: res.channelName,
      token: res.agoraToken,
      uid: generateAgoraUid(res.agoraUsername),
      isVideo: res.isVideoCall,
    });
  } catch (e) {
    useCall.getState().setError(callError(e));
    await teardown();
  }
}

export async function acceptCall(callerId: string): Promise<void> {
  const { incoming } = useCall.getState();
  if (!incoming) return;
  tearingDown = false;
  try {
    const res = await apiStartCall({
      topicId: incoming.topicId,
      isVideoCall: incoming.isVideo,
      callerId,
    });
    const call: ActiveCall = {
      uuid: res.uuid,
      channelName: res.channelName,
      topicId: res.topicId,
      isVideo: res.isVideoCall,
      peerName: incoming.callerName,
      peerAddress: incoming.callerAddress,
      isGroup: res.isGroup,
      groupName: res.groupName,
      outgoing: false,
    };
    useCall.getState().startAnswered(call);
    bindHandlers(callerId);
    sock()?.emit("join", res.channelName);
    await agora.join({
      channelName: res.channelName,
      token: res.agoraToken,
      uid: generateAgoraUid(res.agoraUsername),
      isVideo: res.isVideoCall,
    });
  } catch (e) {
    useCall.getState().setError(callError(e));
    await teardown();
  }
}

/** Reject a ringing incoming call (before answering). */
export function declineIncoming(): void {
  const { incoming } = useCall.getState();
  if (!incoming) return;
  sock()?.emit("end-call", {
    channelName: incoming.channelName,
    callUUID: incoming.uuid,
  });
  useCall.getState().setIncoming(null);
}

/** Local hang-up: tell the server, then tear down. */
export async function endCall(): Promise<void> {
  const { call } = useCall.getState();
  if (call && !tearingDown) {
    sock()?.emit("end-call", {
      channelName: call.channelName,
      callUUID: call.uuid,
    });
  }
  await teardown();
}

/** Tear down media + reset, without re-emitting `end-call` (used on remote end). */
export async function teardown(): Promise<void> {
  if (tearingDown) return;
  tearingDown = true;
  const { call } = useCall.getState();
  if (call) sock()?.emit("leave", call.channelName);
  await agora.leave();
  useCall.getState().reset();
  tearingDown = false;
}

export async function toggleMute(): Promise<void> {
  const next = !useCall.getState().localMuted;
  await agora.setMuted(next);
  useCall.getState().setLocalMuted(next);
}

export async function toggleVideo(): Promise<void> {
  const next = !useCall.getState().localVideoOn;
  try {
    await agora.setVideoEnabled(next);
  } catch {
    // Camera unavailable / permission denied — keep the call audio-only.
    useCall.getState().setError("Couldn't access the camera.");
    return;
  }
  useCall.getState().setLocalVideoOn(next);
  const { call } = useCall.getState();
  if (next && call) {
    // Promote voice → video: prompt peers + persist the call type.
    sock()?.emit("camera-on-invitation", {
      channelName: call.channelName,
      callUUID: call.uuid,
    });
    sock()?.emit("update-call", {
      callUUID: call.uuid,
      payload: { isVideoCall: true },
    });
  }
}

export async function switchCamera(): Promise<void> {
  await agora.switchCamera();
}

/** RTC token nearing expiry → mint a fresh one for the same call and renew. */
export async function renewCallToken(callerId: string): Promise<void> {
  const { call } = useCall.getState();
  if (!call) return;
  try {
    const res = await apiStartCall({
      topicId: call.topicId,
      isVideoCall: call.isVideo,
      callerId,
    });
    await agora.renewToken(res.agoraToken);
  } catch {
    /* best-effort; Agora will drop on expiry if this fails */
  }
}
