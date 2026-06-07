import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { useCall } from "./store";

/*
  Web Agora media layer (singleton), mirroring the RN AgoraService. The SDK is
  dynamic-imported inside methods so it never runs during SSR (it touches
  `window` at module init). Signaling lives elsewhere (useCallSignaling); this
  is media only. See context/08-feature-calls.md §4.
*/

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

type Handlers = {
  /** First remote peer appeared → caller should emit `call-started`. */
  onFirstRemoteJoined?: () => void;
  /** All remotes gone → end the call. */
  onAllRemotesLeft?: () => void;
  onError?: (msg: string) => void;
  onTokenWillExpire?: () => void;
};

class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private mic: IMicrophoneAudioTrack | null = null;
  private cam: ICameraVideoTrack | null = null;
  private remotes = new Map<number, IAgoraRTCRemoteUser>();
  private handlers: Handlers = {};
  private camIndex = 0;
  private joined = false;

  setHandlers(h: Handlers) {
    this.handlers = h;
  }

  isActive() {
    return this.joined;
  }

  async join(opts: {
    channelName: string;
    token: string;
    uid: number;
    isVideo: boolean;
  }) {
    if (!APP_ID) throw new Error("Missing NEXT_PUBLIC_AGORA_APP_ID");
    const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    this.client = client;
    this.registerListeners();
    await client.join(APP_ID, opts.channelName, opts.token, opts.uid);
    this.joined = true;

    // Mic always; camera only for video calls.
    this.mic = await AgoraRTC.createMicrophoneAudioTrack();
    if (opts.isVideo) {
      this.cam = await AgoraRTC.createCameraVideoTrack();
      await client.publish([this.mic, this.cam]);
    } else {
      await client.publish([this.mic]);
    }
  }

  private registerListeners() {
    const client = this.client;
    if (!client) return;
    const store = useCall.getState;

    client.on("user-published", async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
      } catch {
        return;
      }
      const uid = Number(user.uid);
      this.remotes.set(uid, user);
      if (mediaType === "audio") user.audioTrack?.play();
      const wasEmpty = Object.keys(store().peers).length === 0;
      store().upsertPeer(
        uid,
        mediaType === "video" ? { hasVideo: true } : undefined,
      );
      if (wasEmpty) this.handlers.onFirstRemoteJoined?.();
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "video") {
        store().upsertPeer(Number(user.uid), { hasVideo: false });
      }
    });

    client.on("user-joined", (user) => {
      const uid = Number(user.uid);
      this.remotes.set(uid, user);
      const wasEmpty = Object.keys(store().peers).length === 0;
      store().upsertPeer(uid);
      if (wasEmpty) this.handlers.onFirstRemoteJoined?.();
    });

    client.on("user-left", (user) => {
      const uid = Number(user.uid);
      this.remotes.delete(uid);
      store().removePeer(uid);
      if (this.remotes.size === 0) this.handlers.onAllRemotesLeft?.();
    });

    client.on("user-info-updated", (uid, msg) => {
      const id = Number(uid);
      if (msg === "mute-audio") store().upsertPeer(id, { muted: true });
      if (msg === "unmute-audio") store().upsertPeer(id, { muted: false });
    });

    client.on("token-privilege-will-expire", () =>
      this.handlers.onTokenWillExpire?.(),
    );

    client.on("exception", (e) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[agora] exception", e);
      }
    });
  }

  async renewToken(token: string) {
    await this.client?.renewToken(token);
  }

  async setMuted(muted: boolean) {
    await this.mic?.setMuted(muted);
  }

  /** Enable/disable the camera, creating + publishing the track on first use. */
  async setVideoEnabled(on: boolean) {
    if (!this.client) return;
    if (on) {
      if (!this.cam) {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        this.cam = await AgoraRTC.createCameraVideoTrack();
        await this.client.publish(this.cam);
      } else {
        await this.cam.setEnabled(true);
      }
    } else if (this.cam) {
      await this.cam.setEnabled(false);
    }
  }

  async switchCamera() {
    if (!this.cam) return;
    const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
    const cams = await AgoraRTC.getCameras();
    if (cams.length < 2) return;
    this.camIndex = (this.camIndex + 1) % cams.length;
    await this.cam.setDevice(cams[this.camIndex].deviceId);
  }

  playLocalVideo(el: HTMLElement) {
    this.cam?.play(el);
  }

  playRemoteVideo(uid: number, el: HTMLElement) {
    this.remotes.get(uid)?.videoTrack?.play(el);
  }

  async leave() {
    const client = this.client;
    try {
      if (client) await client.unpublish().catch(() => {});
    } catch {
      /* ignore */
    }
    this.mic?.close();
    this.cam?.close();
    try {
      if (client) await client.leave().catch(() => {});
    } catch {
      /* ignore */
    }
    client?.removeAllListeners();
    this.client = null;
    this.mic = null;
    this.cam = null;
    this.remotes.clear();
    this.camIndex = 0;
    this.joined = false;
    this.handlers = {};
  }
}

export const agora = new AgoraService();
