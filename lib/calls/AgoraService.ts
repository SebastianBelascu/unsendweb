import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  ILocalVideoTrack,
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

const MIC_SILENT_MSG =
  "We're not detecting any sound from your microphone. Check that the right input device is selected and not muted in your OS.";

type Handlers = {
  /** First remote peer appeared → caller should emit `call-started`. */
  onFirstRemoteJoined?: () => void;
  /** All remotes gone → end the call. */
  onAllRemotesLeft?: () => void;
  onError?: (msg: string) => void;
  onTokenWillExpire?: () => void;
  /** Our own screen share stopped from the browser's native "Stop sharing" UI. */
  onScreenEnded?: () => void;
};

class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private mic: IMicrophoneAudioTrack | null = null;
  private cam: ICameraVideoTrack | null = null;
  private remotes = new Map<number, IAgoraRTCRemoteUser>();
  private handlers: Handlers = {};
  private camIndex = 0;
  private joined = false;
  // Second connection used only to publish our screen. The main client sees
  // this connection as a remote user; `ignoreUid` filters it back out.
  private screenClient: IAgoraRTCClient | null = null;
  private screenTrack: ILocalVideoTrack | null = null;
  private ignoreUid: number | null = null;
  private micTimer: ReturnType<typeof setInterval> | null = null;

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
    const tracks = opts.isVideo
      ? [this.mic, (this.cam = await AgoraRTC.createCameraVideoTrack())]
      : [this.mic];
    try {
      await client.publish(tracks);
      console.log(
        "[agora] published local tracks",
        tracks.map((t) => t.trackMediaType),
        "uid",
        opts.uid,
      );
    } catch (e) {
      console.warn("[agora] publish FAILED", e);
      throw e;
    }
    this.monitorMicHealth();
  }

  /**
   * Watch the ACTUAL captured input level (0–1). Distinguishes the two failure
   * modes behind "no one can hear me": a dead/wrong input device (level stays
   * ~0 even while you speak) vs the mic capturing fine but not being delivered
   * (level moves — then the problem is elsewhere). Logs the level in dev, and
   * only warns after sustained silence while unmuted (no app-contention blame).
   */
  private monitorMicHealth() {
    const local = this.mic;
    if (!local) return;
    this.clearMicTimer();
    let silentTicks = 0;
    this.micTimer = setInterval(() => {
      if (this.mic !== local) {
        this.clearMicTimer();
        return;
      }
      if (useCall.getState().localMuted) {
        silentTicks = 0;
        this.clearMicWarning();
        return;
      }
      const level = local.getVolumeLevel(); // 0..1
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[mic] input level: ${level.toFixed(3)}`);
      }
      if (level > 0.008) {
        silentTicks = 0;
        this.clearMicWarning();
      } else if (++silentTicks >= 8) {
        useCall.getState().setError(MIC_SILENT_MSG);
      }
    }, 1000);
  }

  private clearMicWarning() {
    const st = useCall.getState();
    if (st.error === MIC_SILENT_MSG) st.setError(null);
  }

  private clearMicTimer() {
    if (this.micTimer) {
      clearInterval(this.micTimer);
      this.micTimer = null;
    }
  }

  private registerListeners() {
    const client = this.client;
    if (!client) return;
    const store = useCall.getState;

    client.on("user-published", async (user, mediaType) => {
      console.log("[agora] user-published", Number(user.uid), mediaType);
      if (Number(user.uid) === this.ignoreUid) return; // our own screen stream
      try {
        await client.subscribe(user, mediaType);
      } catch (e) {
        console.warn("[agora] subscribe failed", Number(user.uid), mediaType, e);
        return;
      }
      console.log("[agora] subscribed", Number(user.uid), mediaType);
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
      if (Number(user.uid) === this.ignoreUid) return; // our own screen stream
      if (mediaType === "video") {
        store().upsertPeer(Number(user.uid), { hasVideo: false });
      }
    });

    client.on("user-joined", (user) => {
      const uid = Number(user.uid);
      if (uid === this.ignoreUid) return; // our own screen stream
      this.remotes.set(uid, user);
      const wasEmpty = Object.keys(store().peers).length === 0;
      store().upsertPeer(uid);
      if (wasEmpty) this.handlers.onFirstRemoteJoined?.();
    });

    client.on("user-left", (user) => {
      const uid = Number(user.uid);
      if (uid === this.ignoreUid) return; // our own screen stream
      const had = this.remotes.delete(uid);
      store().removePeer(uid);
      // Only end when a real tracked peer was the last to leave (a stray
      // screen-uid leave must never tear the call down).
      if (had && this.remotes.size === 0) this.handlers.onAllRemotesLeft?.();
    });

    client.on("user-info-updated", (uid, msg) => {
      const id = Number(uid);
      if (id === this.ignoreUid) return; // our own screen stream
      if (msg === "mute-audio") store().upsertPeer(id, { muted: true });
      if (msg === "unmute-audio") store().upsertPeer(id, { muted: false });
    });

    client.on("token-privilege-will-expire", () =>
      this.handlers.onTokenWillExpire?.(),
    );

    client.on("exception", (e) => {
      // Always surface — an SFU-side publish/permission rejection lands here.
      console.warn("[agora] exception", e);
    });

    client.on("connection-state-change", (cur, prev, reason) => {
      console.log("[agora] connection", prev, "->", cur, reason ?? "");
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

  /**
   * Play a remote stream. `fit: "cover"` fills the tile (cameras); `"contain"`
   * letterboxes to preserve aspect ratio (screen shares — never stretch them).
   */
  playRemoteVideo(
    uid: number,
    el: HTMLElement,
    fit: "cover" | "contain" = "cover",
  ) {
    this.remotes.get(uid)?.videoTrack?.play(el, { fit });
  }

  isScreenSharing() {
    return this.screenClient !== null;
  }

  /**
   * Publish our screen on a SECOND connection. The screen token is bound to the
   * raw numeric `uid` (backend `buildTokenWithUid`), so we join with that uid
   * (not a string account). The main client would otherwise see this connection
   * as a remote peer — `ignoreUid` filters it out for the rest of the call (the
   * uid is deterministic, so re-sharing reuses it; only `leave()` clears it).
   * Throws if the user cancels the picker / denies permission.
   */
  async startScreenShare(opts: {
    channelName: string;
    token: string;
    uid: number;
  }) {
    if (!APP_ID) throw new Error("Missing NEXT_PUBLIC_AGORA_APP_ID");
    if (this.screenClient) return; // already sharing
    const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
    // 'disable' = video only (no system audio) → returns a single track. Needs
    // a user gesture; throws if the picker is cancelled. High-res + "detail"
    // optimization keeps shared text/UI crisp (prioritises clarity over fps),
    // matching what Discord does for screen shares.
    const track = (await AgoraRTC.createScreenVideoTrack(
      { encoderConfig: "1080p_1", optimizationMode: "detail" },
      "disable",
    )) as ILocalVideoTrack;
    const screenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    this.ignoreUid = opts.uid;
    try {
      await screenClient.join(APP_ID, opts.channelName, opts.token, opts.uid);
      await screenClient.publish(track);
    } catch (e) {
      track.close();
      try {
        await screenClient.leave();
      } catch {
        /* ignore */
      }
      throw e;
    }
    this.screenClient = screenClient;
    this.screenTrack = track;
    // Native browser "Stop sharing" button → notify the controller to sync state.
    track.on("track-ended", () => this.handlers.onScreenEnded?.());
  }

  /** Stop publishing our screen + tear down the second connection (idempotent). */
  async stopScreenShare() {
    const track = this.screenTrack;
    const client = this.screenClient;
    this.screenTrack = null;
    this.screenClient = null;
    track?.close();
    if (client) {
      try {
        await client.unpublish().catch(() => {});
      } catch {
        /* ignore */
      }
      try {
        await client.leave().catch(() => {});
      } catch {
        /* ignore */
      }
      client.removeAllListeners();
    }
    // ignoreUid intentionally left set for the call's lifetime (see startScreenShare).
  }

  async leave() {
    this.clearMicTimer();
    // Tear down our screen share first (second connection), if any.
    await this.stopScreenShare();
    this.ignoreUid = null;
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
