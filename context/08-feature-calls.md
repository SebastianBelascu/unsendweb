# 08 — Feature Spec: Voice / Video Calls (Agora)

Purpose: define how unsendnext (Next.js web) implements 1:1 and group voice/video calls against the unchanged backend — REST for token issuance + history, Socket.IO for signaling, `agora-rtc-sdk-ng` for media — at parity with the native clients, including the web-only in-tab-only incoming-call limitation.

> Cross-links: realtime transport, connection lifecycle, room model and the `join`-returns-room-name quirk are in **03-websocket-events.md**. This file assumes the socket is already connected and authenticated per **03-websocket-events.md**. Data models: see **05-data-models.md**. Auth/BFF token handling: see **04-auth-sessions-deviceid.md**.

---

## 1. Mental model

A "call" is one `Call` document (backend/src/entities/call.schema.ts) tied to a `topicId` (the conversation; a conversation is multiple per-user `Thread` docs sharing one `topicId`). Media flows through **Agora RTC** on a channel named `call_${topicId}`. Signaling (ring, received, ended, camera-on) flows through the **same Socket.IO connection** used for chat, using the channel name as the socket room.

Two parallel planes — keep them separate in the web client:

| Plane | Transport | Carries |
|---|---|---|
| Media | Agora RTC (`agora-rtc-sdk-ng`) | audio/video tracks, remote user join/leave, remote mute/video state |
| Signaling | Socket.IO room = `channelName` | ring state, "received" ack, "ended", "camera-on invitation", call-status mutations |

The Agora channel and the socket room are **distinct systems that happen to share the same string** (`call_${topicId}`). You must join *both*: join the Agora channel for media, and `emit('join', channelName)` on the socket for signaling.

---

## 2. Token issuance — `POST /api/v1/calls/start`

Source: backend/src/calls/calls.controller.ts (`startCall`), backend/src/calls/calls.service.ts (`startCall`), backend/src/calls/dtos/start-call.dto.ts.

This single endpoint both **creates/opens** the call and **returns the Agora credentials** for the caller. There is no separate "get token" endpoint — every joiner calls `/calls/start` for the same topic; if an ACTIVE/STARTED call already exists the server returns that existing call's details (so the second participant who also POSTs `start` joins the same channel rather than creating a new call).

### Request body (`StartCallDto`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | string | one of `topicId`/`recipientUsername` | Existing conversation. Wins if both sent. |
| `recipientUsername` | string | one of the two | 1:1 call to a friend never messaged. Server creates the chat + per-user threads on demand, then resolves a `topicId`. Cannot equal your own username. |
| `isVideoCall` | boolean | yes | `true` = video, `false` = voice. |
| `callerId` | string | yes (DTO) | The starting user's id. Note: the controller actually trusts `req.user` from the JWT for the caller identity; `callerId` is required by the DTO but server-side identity comes from the token. |

Optional header: `socketid` or `x-socket-id` — the caller's own socket id, used server-side as `excludedSocketId` so the caller does not receive its own call-info socket echoes. Web client should send its current `socket.id` here.

### Response (`ICallNotificationPayload`)

Source: backend/src/types/notification.ts. The OpenAPI inline schema (controller `@ApiResponse`) lists a superset; the **actual returned object** is `ICallNotificationPayload` plus a few extra fields the service spreads in. Treat OpenAPI loosely here (`participants` typed loosely; `caller` is `IContact`). Confirm shapes against this file and calls.service.ts.

| Field | Type | Use on web |
|---|---|---|
| `uuid` | string | Call UUID — primary key for all subsequent signaling (`call-started`, `end-call`, `call-received`). |
| `topicId` | string | Conversation id. |
| `channelName` | string | `call_${topicId}` — Agora channel **and** socket room. |
| `isVideoCall` | boolean | Initial media mode. |
| `agoraToken` | string | RTC token, role `publisher`, ~3600s expiry. Pass to Agora `join`. |
| `agoraUsername` | string | The username whose UID this token was minted for (the caller's username). **Derive the Agora UID from this**, see §4. |
| `caller` | `IContact` (`{ _id, name, address }`) | For the calling UI / outgoing banner. |
| `participants` | `ICallParticipant[]` | Roster: `{ userId, username, name, address, uid?, isOnHold?, isMuted?, isVideoOn? }`. Note `uid` here is the **username string**, not the numeric Agora UID (service sets `uid: user.username`). |
| `isGroup` | boolean | Drives group vs 1:1 UI and end-call semantics. |
| `groupName` | string? | `'<chatName>' group call` for groups, else null. |
| `messageId` | string? | The call info-message `headerId`; ties the call to its in-thread system message. |

The token is built for the user identified by `agoraUsername`. When the **receiver** joins, the receiver must call `/calls/start` itself (same topic) to obtain a token minted for *its own* username — you cannot reuse the caller's token, because the token is bound to a specific UID.

> The web client never holds the Agora App Certificate; tokens are always server-minted. The App ID is public and needed client-side to construct the Agora client (env `NEXT_PUBLIC_AGORA_APP_ID`, must match the backend's `AGORA_APP_ID`).

---

## 3. The Agora UID derivation — MUST replicate exactly

The numeric Agora UID is **not** returned by the API directly; the token is minted with a UID the server derives from the username via a deterministic hash. The web client must compute the **identical** UID from `agoraUsername` (its own username) before joining, or the token will be rejected.

Ground truth — backend/src/agora/agora.service.ts `generateAgoraUid` and the RN replica frontend/src/Utils/agoraUid.ts `generateAgoraUid` (byte-identical):

```ts
// PORT THIS VERBATIM to unsendnext. Do not "improve" it.
export const generateAgoraUid = (username: string): number => {
  if (!username) return 0;
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash); // hash*31 + char, 32-bit
  }
  return (Math.abs(hash) % 2147483647) + 1; // 1 .. 2^31-1
};
```

Notes that make this exact:
- `(hash << 5) - hash` is `hash * 31`; the `<<` forces 32-bit signed overflow wraparound — JS bitwise ops are 32-bit, so this is reproducible cross-platform.
- Range is `1 .. 2147483647` (server comment says "1 to 2^32-1" but the math caps at 2^31-1; match the math, not the comment).
- The server mints the token with `RtcTokenBuilder.buildTokenWithUserAccount(..., uid, ...)` passing this numeric UID. Joining with any other UID → join failure / token mismatch.

**Rule:** on web, `const uid = generateAgoraUid(response.agoraUsername)` then `client.join(appId, channelName, agoraToken, uid)`. (RN does exactly this in frontend/src/Contexts/ActiveCall/hooks/useAgora.ts.)

---

## 4. Agora Web SDK flow (`agora-rtc-sdk-ng`)

The RN app uses `react-native-agora` (engine-based API, see frontend/src/Services/AgoraService.ts). The web SDK API differs but the lifecycle and callbacks map 1:1. Build a web `AgoraService` (singleton) mirroring the RN one. Mapping reference:

| Concept | RN (`react-native-agora`) | Web (`agora-rtc-sdk-ng`) |
|---|---|---|
| Create | `createAgoraRtcEngine()` + `initialize({appId})` | `AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })` |
| Role | `setClientRole(Broadcaster)` | `mode: 'rtc'` (everyone publishes; no host/audience) |
| Join | `engine.joinChannel(token, channel, uid, opts)` | `await client.join(appId, channelName, agoraToken, uid)` |
| Publish mic | `enableAudio()` + auto | `AgoraRTC.createMicrophoneAudioTrack()` then `client.publish([micTrack])` |
| Publish cam | `enableVideo()` + `startPreview()` | `AgoraRTC.createCameraVideoTrack()` then `client.publish([camTrack])` |
| Subscribe | auto (`autoSubscribeAudio/Video`) | listen `client.on('user-published', ...)` → `await client.subscribe(user, mediaType)` |
| Remote render | `RtcSurfaceView` by uid | `user.videoTrack.play(htmlEl)` / `user.audioTrack.play()` |
| Mute mic | `muteLocalAudioStream(bool)` | `micTrack.setEnabled(false)` or `setMuted(true)` |
| Toggle cam | `setVideo(bool)` / `startPreview` | publish/unpublish camTrack or `camTrack.setEnabled(bool)` |
| Switch cam | `switchCamera()` | `camTrack.setDevice(deviceId)` (enumerate via `AgoraRTC.getCameras()`) |
| Leave | `leaveChannel()` + `release()` | stop+close local tracks, `await client.leave()` |

### Recommended web sequence

1. **Get media first / on gesture.** Browsers require a user gesture before `getUserMedia` and before audio playback. Create local tracks inside the click handler of the "call"/"answer" button.
2. `AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })` once (singleton).
3. Register listeners *before* join: `user-published`, `user-unpublished`, `user-joined`, `user-left`, `user-info-updated` (mute), `connection-state-change`, `token-privilege-will-expire`.
4. `await client.join(appId, channelName, agoraToken, generateAgoraUid(agoraUsername))`.
5. Create + publish mic track always; publish camera track only if `isVideoCall`.
6. On `user-published(user, mediaType)` → `await client.subscribe(user, mediaType)`; if `'video'` play into that peer's `<div>`; if `'audio'` call `user.audioTrack.play()` (no element needed).
7. On `user-left` / `user-unpublished` → tear down that peer's tile.

### Mapping Agora events → state (mirror useAgora.ts)

| RN callback | Web event | unsendnext reaction |
|---|---|---|
| `onJoinChannel(localUid)` | resolved `client.join()` | store localUid; status Idle/Calling → caller=`calling`, receiver=`connecting` |
| `onUserJoined(uid)` | `user-joined` / first `user-published` | stop ringtone; add peer; **emit `call-started`** (see §6); status → `joining` then `joined` (~300ms later in RN) |
| `onUserOffline(uid)` | `user-left` | remove peer; if peers ≤ 1 and not already ending → end call |
| `onRemoteVideoStateChanged(uid,state)` | `user-published('video')` / `user-unpublished('video')` | toggle that participant's `isVideoOn` |
| `onRemoteAudioStateChanged(uid,state,reason)` | `user-info-updated` (`mute-audio`/`unmute-audio`) | toggle that participant's `isMuted` |
| `onError(code)` | client `'exception'` / rejected promises | surface error, cleanup |

Matching peers to roster: a remote Agora UID is numeric. To map it back to a `participant`, compute `generateAgoraUid(participant.address.split('@')[0])` for each roster entry and compare (RN does exactly this fallback in useAgora.ts when the raw uid match fails).

---

## 5. Call state machine (idle → ringing → connecting → active → ended)

The native client tracks call status with this enum (frontend/src/Redux/slices/activeCall.ts):

`idle | calling | connecting | ringing | joining | joined`

Map to the spec's coarse states:

| Spec state | RN status | Meaning |
|---|---|---|
| idle | `idle` | no active call |
| ringing | `calling` → `ringing` | outgoing: dialing; flips to `ringing` when receiver acks (see `call-received`) |
| connecting | `connecting` | receiver answered, joining Agora channel |
| active | `joining` → `joined` | a remote peer is on the Agora channel; media flowing |
| ended | (cleared to `idle`) | call torn down |

### Caller path

```
[idle]
  --POST /calls/start--> get token; status=calling; play outgoing ringtone
  --socket emit('join', channelName)--> register listener keyed by channelName (see 03-websocket-events.md quirk)
  --Agora join + publish mic(/cam)-->
  --recv 'call-received' (room=channelName)--> status=ringing  (receiver's device got the invite)
  --Agora 'user-joined'--> stop ringtone; emit('call-started', uuid); status=joining→joined  [active]
  --hang up--> emit('end-call', {channelName, uuid}); leave Agora; cleanup  [ended]
```

### Receiver path (in-tab only on web — see §9)

```
[idle]
  --socket 'create' message with {callUUID, channelName} arrives in user room--> show incoming-call UI
  --POST /calls/{uuid}/received  (+ emit 'call-received')--> caller flips to ringing
  --user accepts--> POST /calls/start (own token); status=connecting
  --emit('join', channelName); Agora join + publish-->
  --Agora 'user-joined'--> emit('call-started', uuid); status=joined  [active]
  --decline / hang up--> emit('end-call', {channelName, uuid})  [ended]
```

### End / terminal statuses (server-decided)

The server (sockets.gateway.ts `end-call`) computes the final `Call.status` and duration when it processes `end-call`:

| Condition | Final status |
|---|---|
| call was `STARTED` (both joined) and ends | `ENDED` (duration = now − startedAt) |
| caller hangs up while `ACTIVE`, `receivedAt` was set | `MISSED` (+ missed-call push) |
| caller hangs up while `ACTIVE`, never received | `FAILED` |
| receiver hangs up while `ACTIVE` (before answering) | `DECLINED` |

The server then broadcasts `call-ended` to the room (excluding the hanging-up socket) and the other side cleans up. Web must listen for `call-ended` and tear down even if it did not initiate the hang-up.

---

## 6. Signaling lifecycle over Socket.IO

All call signaling rides the shared socket (transports `['websocket']`). **Critical quirk (see 03-websocket-events.md):** the server's `join` handler emits an event whose **name equals the room name** — i.e. `io.in(channelName).emit(channelName, {name, eventType:'Joined'})`. So after `emit('join', channelName)` you must `socket.on(channelName, ...)` to observe other participants joining the signaling room. The substantive call events below, however, are emitted under their own fixed event names (`call-ended`, `call-received`, `camera-on-invitation`) into the `channelName` room.

### Client → Server (emit)

Source: sockets.gateway.ts handlers. Event names from frontend/src/Types/socket/index.ts (`SocketMessages`).

| Emit | Payload | Server effect |
|---|---|---|
| `join` | `channelName` (string) or `{channelName}` | Join signaling room; server replies by emitting an event **named `channelName`**. |
| `leave` | `channelName` | Leave the room. |
| `call-started` | `callUUID` (raw string) | `updateCallStarted(uuid)`: ACTIVE → STARTED (idempotent). Emit when a remote peer joins Agora. |
| `call-received` | `{ callUUID, channelName }` | Marks `receivedAt`; server re-broadcasts `call-received` to the room (caller flips to ringing). Receiver emits this on incoming. |
| `update-call` | `{ callUUID, payload: { isVideoCall } }` | Updates call `type` (voice/video). Emitted when a participant turns on camera (promotes voice→video). |
| `camera-on-invitation` | `{ channelName, callUUID }` | Server re-emits `camera-on-invitation` to the room (excluding sender) so peers prompt to enable their camera. |
| `end-call` | `{ channelName, callUUID }` | Server computes terminal status + duration, updates the call message, broadcasts `call-ended` to the room (excluding sender), and sends VoIP termination pushes to users not on the call. |

### Server → Client (listen)

| Event | Room | Payload | Web reaction |
|---|---|---|---|
| `<channelName>` (room-named) | `channelName` | `{ name, eventType: 'Joined' }` | Optional: observe signaling-room joins (quirk in 03-websocket-events.md). |
| `call-received` | `channelName` | `{ callUUID, channelName }` | Caller only: if status is `calling`/`connecting` → set `ringing`. |
| `call-ended` | `channelName` | `{ channelName, callUUID }` | Tear down: leave Agora, stop tracks, clear UI, mark call ended. Guard with `!isEndingCallRef` to avoid double-cleanup. |
| `camera-on-invitation` | `channelName` | `{ channelName, callUUID }` | If currently audio-only: haptic/sound, navigate to call UI, show "turn on camera?" prompt. |
| `create` (chat message) | userId room | message with `{ ...message, callUUID, channelName }` for receivers | **Incoming-call trigger.** The call info-message arrives as a normal `create` socket event in the receiver's userId room; receivers (not the caller) get `callUUID` + `channelName` attached, which is how the web client detects an incoming call. (calls.service.ts attaches these only for `isReceiver`.) |

> The caller does NOT receive `callUUID`/`channelName` on its own info message (it already has them from the `/calls/start` response and is excluded via `excludedSocketId`).

### Camera-on (voice → video) flow

`useVideoCallActions.toggleVideo(notify=true)` on RN does, on enabling camera:
1. `emit('camera-on-invitation', { channelName, callUUID })` — prompts peers.
2. `emit('update-call', { callUUID, payload: { isVideoCall: true } })` — persists call type.
3. `AgoraService.setVideo(true)` — publish camera track locally.

Web replicates: publish the camera track, then emit those two events. Peers receiving `camera-on-invitation` show the invitation UI and may enable their own camera.

---

## 7. Participant mute / hold / video — `PUT /api/v1/calls/:uuid/participant/:username`

Source: calls.controller.ts `updateCallParticipant`, calls.service.ts `updateCallParticipantByUsername`, dto update-participant.dto.ts.

`PUT /api/v1/calls/{uuid}/participant/{username}` with body (`UpdateParticipantDto`), all optional:

| Field | Type |
|---|---|
| `isOnHold` | boolean |
| `isMuted` | boolean |
| `isVideoOn` | boolean |

Updates the matching participant subdocument in the `Call` and returns the updated call. Use `username` (not userId) in the path; the server matches `participants.username === username`. Returns 404 if call or participant not found.

> This endpoint persists participant state for history/roster. It does **not** itself control the media stream — the actual mute/video is done locally via Agora (`micTrack.setMuted`, publish/unpublish cam). Remote peers learn of a mute/video change primarily through Agora's `user-info-updated` / `user-published` events (mirrored in useAgora.ts), not through this REST call. Treat the REST call as the durable record and the Agora events as the realtime signal. The RN active-call path drives realtime mute via Agora; confirm whether you also need the REST persistence for your UI (it is the source for call history roster state).

---

## 8. Call history & delta sync

Source: calls.controller.ts. REST paths (RN constants frontend/src/Constants/api.ts confirm the live ones).

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/v1/calls/history?limit=` | Calls where user is caller or participant, newest first, each enriched with `threadId`. Default limit 100. | Primary history list. RN uses this. |
| `GET /api/v1/calls/sync/{lastSyncTime}` | `{ calls, deletedCallUUIDs, syncTime, updatedCount, deletedCount }` | Delta sync. `lastSyncTime` is an ISO/Date-parseable string; 400 on unparseable. `deletedCallUUIDs` is currently always `[]` (no hard deletes). `syncTime` is the ISO checkpoint to pass next time. RN constant: `getCallsDeltaSync`. |
| `GET /api/v1/calls/topic/{topicId}/history?limit=` | Calls for one conversation, newest first. Default limit 50. | Per-conversation call log. |
| `GET /api/v1/calls/uuid/{uuid}` | Single call by UUID. | RN constant `getCallByUUID`. 404 if missing. |
| `GET /api/v1/calls/channel/{channelName}` | Single call by channel. | |
| `GET /api/v1/calls/topic/{topicId}` | All calls for a topic (unbounded). | |
| `GET /api/v1/calls/user/{userId}/active` | Active calls for a user. | For "rejoin ongoing call" UX. |
| `POST /api/v1/calls/{uuid}/received` | Marks received + broadcasts `call-received`. | Receiver should POST this (or emit the socket event) on incoming. Idempotent server-side. |
| `PUT /api/v1/calls/{uuid}` | Update status/type/duration/receivedAt. | Mostly server-internal; clients normally drive status via `end-call`/`call-started` sockets. |
| `POST /api/v1/calls` | Raw create (`CreateCallDto`). | Low-level; web should use `/calls/start`, not this. |

Recommended TanStack Query usage: `['calls','history']` for the list (invalidate on `call-ended`/`call-started` socket events); a `lastSyncTime` cursor for incremental refresh on reconnect. The query cache is the source of truth for call-history entities; socket events write into it (consistent with the project's data layer).

The info-message in the thread (text like `outgoing video call`, then on end `video call • 5 min` / `missed audio call` / `call declined` / `call failed`) is updated by the backend (calls.service.ts `updateCallMessage`) and arrives via normal message socket/REST flows — the calls history list and the chat thread show the call from two angles.

---

## 9. Web limitation: incoming calls only while a tab is open

**This is a hard, documented limitation, not a bug.**

The native apps receive calls in the background via **VoIP push (iOS PushKit / CallKeep, Android foreground service)** — see frontend/src/Utils/CallManager.tsx (`react-native-voip-push-notification`, `react-native-callkeep`). The backend emits an `incoming-call-notification` internal event (`eventEmitter.emit('incoming-call-notification', finalCallData)` in calls.service.ts) that fans out to VoIP/APNs/FCM for device wake-up.

The web has **no equivalent**:
- The incoming-call signal that the web *can* see is the `create` socket message carrying `callUUID`+`channelName`, delivered into the user's socket room. That requires a **live Socket.IO connection**, which only exists while a unsendnext tab is open and connected.
- There is no Web VoIP push. The Web Push API + a service worker could show a notification, but the backend does not send web-push payloads, and even then it cannot ring like CallKit. **Background/closed-tab ringing would require a backend change (web-push registration + dispatch) and is OUT OF SCOPE.**

Practical consequences for unsendnext:
- Incoming calls ring **only** in an open, connected tab. If no tab is open, the caller will time out (RN caller timeout is ~60s, `CALL_TIMEOUT_MS` in useAgora.ts) and the call resolves to `MISSED`/`FAILED`; the user sees it in call history + the thread info-message.
- If multiple tabs are open, all connected sockets in the userId room get the event — dedupe in the client (e.g., a leader-tab via BroadcastChannel) to avoid multiple ringing tabs.
- Document this clearly in product copy: "Calls ring on the web only while Unsend is open in a browser tab."

---

## 10. Browser gotchas (web-specific, not present on native)

| Gotcha | Why | Handling |
|---|---|---|
| **Autoplay after gesture** | Browsers block audio/video playback and `getUserMedia` without a prior user gesture. | Create local tracks and start remote `audioTrack.play()` inside the click handler of Call/Answer. Never auto-join on mount. If a remote audio play() is blocked, surface an "unmute / tap to hear" button. |
| **Permissions** | Mic/camera require explicit per-origin permission; can be denied or "dismissed". | Request via Agora track creation in the gesture; handle `NotAllowedError`/`NotFoundError`; show a permission-help UI. Re-check on each call (permission can be revoked). |
| **Safari WebRTC quirks** | Safari (and iOS Safari) is stricter: `getUserMedia` only on HTTPS + gesture; H.264 codec preferences; backgrounding a tab suspends media. | Test on Safari explicitly. Consider `codec: 'h264'` if Safari interop issues appear (default `vp8` per §4). iOS Safari kills media when tab backgrounds — expect dropped calls. |
| **TURN / NAT traversal** | P2P fails behind symmetric NAT / corporate firewalls. | Agora provides its own TURN/relay infrastructure as part of the SDK — no self-hosted TURN needed. Ensure the Agora App ID/project has relay enabled. Outbound UDP may be blocked on some networks; Agora falls back to TCP/443. |
| **HTTPS required** | `getUserMedia` and secure contexts. | unsendnext must be served over HTTPS (localhost is treated as secure for dev). |
| **Token expiry** | RTC token ~3600s. | Listen for Agora `token-privilege-will-expire`; re-fetch via `POST /calls/start` (returns a fresh token for the same active call) and `client.renewToken(newToken)`. |
| **Device hot-swap** | Users plug/unplug headsets mid-call. | Listen to `AgoraRTC.onMicrophoneChanged` / `onCameraChanged`; re-create or `setDevice` on the affected track. |
| **Cleanup on unload** | Closing the tab must end the call. | On `beforeunload`/`pagehide`, `emit('end-call', {...})` (best-effort) and `client.leave()`; otherwise the peer waits for the Agora `user-left` timeout. |

---

## 11. Implementation checklist for unsendnext

1. Port `generateAgoraUid` verbatim (§3) — shared util; never diverge from backend/src/agora/agora.service.ts.
2. Build a web `AgoraService` singleton (mirror frontend/src/Services/AgoraService.ts) using `agora-rtc-sdk-ng` per the mapping in §4.
3. Wire signaling on the shared socket: `join`/`leave` the `channelName` room; listen `call-received`, `call-ended`, `camera-on-invitation`; emit `call-started`, `end-call`, `update-call`, `camera-on-invitation` (mirror useCallSocketUpdates.ts + useVideoCallActions.ts).
4. Detect incoming calls from the `create` socket message carrying `callUUID`+`channelName`; POST `/calls/{uuid}/received` + emit `call-received`.
5. Manage call status with the §5 state machine (Zustand for ephemeral call state; TanStack Query cache for the durable `Call`/history entities).
6. Gate all `getUserMedia`/playback behind a user gesture (§10).
7. Show the in-tab-only limitation in UI copy (§9).
8. History/sync via the §8 endpoints; invalidate on terminal socket events.

> Where OpenAPI types the `/calls/start` response or `participants` as `any`/loose, prefer `ICallNotificationPayload` (backend/src/types/notification.ts) and confirm against calls.service.ts and frontend/src/Types/CallPayload.ts.
