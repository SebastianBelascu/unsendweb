# 13 - Reuse From the React Native App

Purpose: catalogue what `unsendnext` (Next.js web) can lift verbatim, adapt, or must rewrite from the existing React Native app, so the web build is an accelerated port rather than a from-scratch effort.

The RN app's portable logic lives under `frontend/src/` in `Types/`, `Services/`, `Hooks/`, `Redux/`, `Api/`, plus the socket layer in `Classes/SocketManager.ts` and `Contexts/Socket/`. This doc names the real files. For backend contracts see `05-data-models.md`; for socket events see `03-websocket-events.md`; for the BFF/auth bridge see `04-auth-sessions-deviceid.md`.

---

## 1. RN module -> what it provides -> how it ports

Port verdicts: **Verbatim** = copy types/contracts almost unchanged; **Adapt** = keep the logic shape, swap the I/O edge; **Rewrite** = native dependency, redo for the web.

| RN module (repo path) | What it provides | Port to web |
|---|---|---|
| `frontend/src/Types/**` (auth, message, threads, attachment, contact, device, call, socket, upload) | All request/response DTO shapes and domain models (`Message`, `Thread`, `Email`, `Attachment`, `Reaction`, `CallDataPayload`, `SocketMessages` enum) | **Verbatim** copy. These are plain TS types with no RN imports. Reconcile against the generated OpenAPI client (see caveat 2). |
| `frontend/src/Services/auth.ts` | `login`, `register`, `sendVerificationCode`, `resendVerificationCode`, `verifyRegisteredUser`, `verifyResetPasswordCode`, `requestResetPassword`, `resetPassword`, `changePassword`, `checkExistingUserData`, `getSignedForUploadProfileImage`, `updateProfileImageVersion` | **Adapt**: keep endpoint paths + payloads; route token-bearing calls through the BFF and store tokens in httpOnly cookies instead of returning them to JS. |
| `frontend/src/Services/message.ts` | The full chat/email contract: `sendMessage`, `fetchThreadMessages`, `editMessage`, `deleteMessageForMe`, `deleteMessageForAll`, `reactToAMessage`, `removeReaction`, `getReactionsToAMessage`, seen/delivered markers, `openNewThread`, `getOldChatThread`, `getMessageHtml`, `forwardMessages`, `getPopularAndMostRecentChats`, `getUserChatContacts` | **Adapt**: contracts port directly; replace `axiosInstance` with `openapi-fetch`. Note `sendMessage` rewrites `\n` -> `<br />` and forces `withUrlPreview` boolean — keep this. See caveat 1 (`refId`). |
| `frontend/src/Services/Thread.ts` | `fetchThreads`, `updateThread`, `updateChatInfo`, `updateChatParticipants`, `leaveGroup` | **Adapt** (swap HTTP client only). |
| `frontend/src/Services/contact.ts` | `searchUserContacts`, `fetchLocalContactByEmail(+WithStatus)`, `getAllContact` | **Adapt**. "Local contacts" came from the device address book on mobile — on web there is no address book, so only the server-search calls are meaningful. |
| `frontend/src/Services/attachment.ts` | Multipart upload contract: `startUpload`, `getUploadUrl` (per-part presigned URL), `completeUpload` | **Adapt**: the orchestration logic ports; only the byte source (RN file URI) changes to a browser `File`/`Blob`. |
| `frontend/src/Services/upload.ts` | Single-shot presign+PUT+create-attachment flow (`uploadProcessWithoutMultipartChunk`) | **Rewrite**: it uses `expo-file-system` `readAsStringAsync`, `Buffer`, and `mime`. Replace with `file.slice()` / `fetch(PUT, body: blob)`. The HTTP shape (presigned PUT then create) is the reusable part. |
| `frontend/src/Services/device.ts` | `registerNewDevice`, `updateDeviceVoipToken`, `deleteRegisterDevice`, `resetDeviceNotificationBadge`, `getDeviceBadgeCount` | **Mostly drop / Rewrite**. Device + VoIP token registration is for native push; web has no VoIP. A web "device" registration (if used at all) would be for Web Push, which is out of scope (see backend quirk 5). Keep only if the backend needs a device row for the session. |
| `frontend/src/Services/AgoraService.ts` | Singleton wrapper over `react-native-agora`: join/leave channel, mute, speaker, video toggle, switch camera, event handlers | **Rewrite** against `agora-rtc-sdk-ng`. The *interface* (the `AgoraCallbacks` shape: `onJoinChannel`, `onUserJoined`, `onUserOffline`, `onRemoteVideoStateChanged`, `onRemoteAudioStateChanged`, `onError`) and the singleton + `joinChannel(token, channelName, uid, isVideoCall, callbacks)` API are an excellent web blueprint. See `08-feature-calls.md`. |
| `frontend/src/Services/tenor.ts`, `avatarSync.ts`, `deviceActivity.ts`, `VideoDownloadManager.ts` | GIF search, avatar cache sync, activity ping, video caching | **Adapt** (tenor: verbatim HTTP) / **Rewrite** (avatar + video caching are native FS/FastImage; redo with browser cache / IndexedDB / `next/image`). |
| `frontend/src/Classes/SocketManager.ts` | socket.io-client singleton: connect with `auth.token`, `join`/`leave` room emits, `on/off` fan-out, room re-join on reconnect | **Adapt**: logic ports nearly verbatim. Force `transports: ['websocket']` (RN currently allows `'polling'` fallback — the gateway is websocket-only, so drop polling). Token comes from `/api/auth/socket-token`, not Keychain. |
| `frontend/src/Contexts/Socket/SocketContext.tsx` | React context exposing `isConnected`, `socketId`, `connect/disconnect`, `joinRoom/leaveRoom`, `emit`, `on`; wires `session:invalidate` -> logout | **Adapt**: drop `AppState`/`AsyncStorage`; use `visibilitychange`/`online` events and the cookie/IndexedDB token. The `session:invalidate` -> clear-session flow ports directly. |
| `frontend/src/Hooks/Socket/useThreadUpdates.tsx` | Maps `create`/`update`/`delete` socket events to local store; thread-vs-message discrimination (`lastMessage && !headerId` => thread; `headerId && messageId` => message); 150ms batching; recently-processed dedupe; "is newer" guard; notify-if-not-current-thread | **Adapt**: the event routing, discrimination, batching, and dedupe logic is gold. Replace the Realm write (`insertBulkThread`) with a TanStack Query cache write; replace `onDisplayNotification` (notifee) with the Notifications API. |
| `frontend/src/Hooks/Socket/useMessageUpdates.tsx` | Same pattern for messages: `create`/`update`/`delete`, 50ms batch, dedupe, `isNewer` guard, soft-delete on `delete` | **Adapt** (swap Realm -> Query cache). |
| `frontend/src/Hooks/Socket/useTypingIndicator.tsx` | `startTyping`/`stopTyping` emit `typing` with `{channel, event:'typing'|'stop-typing'}`; inbound `typing`/`stop-typing` -> reducer | **Verbatim logic**; move typing state into Zustand instead of Redux. |
| `frontend/src/Hooks/Socket/useRoomManagement.tsx` | Joins/leaves thread room + topic room on mount/unmount; skips `NOT-SEND` temp ids | **Verbatim logic** (pure socket + effect). |
| `frontend/src/Hooks/useSocket.tsx` | Aggregator hook combining the three socket hooks + connection state | **Verbatim shape** — re-export the adapted hooks. |
| `frontend/src/Hooks/Apis/*` (`useThreads.tsx`, `useMessagesBulk.tsx`, `useThreadSync.tsx`, `useCallHistory.tsx`, `useCallSync.tsx`, `useSuggestions.ts`, `useSyncHealthCheck.tsx`, `ForgetPassword/`, `ResetPassword/`, `VerifyResetPasswordCode/`, `ResendVerificationCode/`) | TanStack-Query-style data hooks (already `useQuery`/`useInfiniteQuery`/`useMutation`) incl. pagination math, pinned-thread merge, `getNextPageParam` | **Adapt**: these are the closest to drop-in. RN imports `react-query` (v3/v4 API: positional args, `cacheTime`); rename to TanStack Query v5 (`@tanstack/react-query`, object args, `gcTime`). Query keys, page size (`PAGE_SIZE = 24`), and refetch policy port as-is. |
| `frontend/src/Redux/slices/*` (`auth`, `messages`, `thread`, `app`, `activeCall`, `userProfiles`, `chatInputForm`, `chatSelectionMode`, `bottomSheetPanel`, `floating`) | Redux Toolkit slices = the app's client-state shape | **Adapt to Zustand**: the *state shape and reducers are the spec*. Server-entity slices (`messages.messagesGroupByThreadId`, `thread`) should NOT be reimplemented — those become the TanStack Query cache. Ephemeral slices (`activeCall`, `app.typingInfo`, selection mode, composer form) become Zustand stores. |
| `frontend/src/Contexts/ActiveCall/**` (`ActiveCallProvider.tsx`, `hooks/useAgora.ts`, `useCallActions.ts`, `useCallSocketUpdates.ts`, `useVideoCallActions.ts`, `useOutputDevice.ts`, `useCallSfx.ts`) | Full call orchestration: start/join, Agora wiring, call socket events (`call-created`, `call-ended`, `call-received`, `update-call`, `missed-call`, `camera-on-invitation`), SFX, lifecycle | **Adapt** (state machine + socket routing) + **Rewrite** (Agora + audio-device edges). `useCallSocketUpdates.ts` is the canonical mapping of `SocketMessages` enum events to state — reuse its structure. |

---

## 2. What PORTS cleanly vs what must be REWRITTEN

### Ports cleanly (copy or near-copy)

- **All `Types/`** — request/response DTOs and models. `frontend/src/Types/message/index.ts` (`Message`, `Email`, `Reaction`, `Attachment`), `frontend/src/Types/threads/index.ts` (`Thread`), `frontend/src/Types/message/request.ts` (`RequestSendMessagePayload`, `RequestForwardBody`), `frontend/src/Types/socket/index.ts` (`SocketMessages` enum + `SocketMessagePayloads`), `frontend/src/Types/CallPayload.ts` (`CallDataPayload`).
- **API request/response contracts** — every function body in `Services/*.ts` that just builds a URL + payload and returns typed data. Endpoint paths are centralized in `frontend/src/Constants/api.ts` (global prefix is `/v1/...`; the web base prefix is `/api/v1`).
- **Query logic** — `Hooks/Apis/*` already use React Query: keys, `getNextPageParam`, the inbox pinned-thread merge in `useThreads.tsx`, staleness config. Migrate v3/v4 -> v5 syntax only.
- **Socket logic** — `SocketManager.ts` connection/rooms/fan-out; `useThreadUpdates`/`useMessageUpdates`/`useTypingIndicator`/`useRoomManagement` event handling, batching, dedupe, and the thread-vs-message discriminator. These contain hard-won concurrency fixes; copy the algorithms.
- **State shape** — Redux slice state interfaces and reducer semantics are a precise spec for the Zustand stores (esp. `activeCall.ts`'s `CallStatus` machine and `app.ts`'s `typingInfo` nested map).
- **Optimistic / temp-id logic** — `Redux/slices/messages.ts` reducers `addMessageBasedOnThreadId`, `createOrUpdateMessageBasedOnThreadId`, and `updateMessageBasedOnThreadIdFormTemp` (swap a temp message in place by `tempMessageId`) are the optimistic-send pattern; port the algorithm into TanStack Query optimistic mutations. `arrayUniqueByKey` dedupe helper ports verbatim.

### Must be rewritten (native I/O edges)

| Native edge (RN) | Files | Web replacement |
|---|---|---|
| Token storage in OS Keychain | `frontend/src/Utils/accessToken/index.tsx` (`react-native-keychain`, service `com.unsend.accessToken`) | httpOnly Secure cookie via BFF for the JWT; short-lived JS-readable token from `/api/auth/socket-token` for the handshake. The `setAccessToken/getAccessToken/deleteAccessToken` interface stays; the implementation is fully rewritten. |
| Offline DB (Realm) + key-value store (AsyncStorage) | `useThreadUpdates`/`useMessageUpdates` (`@realm/react`, `insertBulkThread`, `insertMessageToDb`), `Redux/slices/app.ts` (AsyncStorage persist), `Contexts/Socket/SocketContext.tsx` (`AsyncStorage` for refresh token/userId) | TanStack Query cache is the source of truth for server entities; IndexedDB for any durable offline cache; the socket-event handlers write into the Query cache instead of Realm. |
| Native image loading/caching (FastImage) | thread/avatar rendering, `useThreads.tsx` avatar pre-cache comments | `next/image` (+ browser HTTP cache). |
| File pickers / file system | `Services/upload.ts` (`expo-file-system`, `Buffer`, `mime`), attachment thumbnailing | Browser `<input type=file>` / drag-drop -> `File`/`Blob`; presigned `PUT` with the blob body; client-side thumbnails via `<canvas>`/`<video>`. |
| Realtime A/V (react-native-agora) | `Services/AgoraService.ts`, `Contexts/ActiveCall/hooks/useAgora.ts` | `agora-rtc-sdk-ng` Web SDK. Reuse the callback/interface shape; rewrite engine calls and video rendering (DOM `<video>` track play vs RN `<RtcSurfaceView>`). |
| CallKeep / VoIP push / background calling | `Services/device.ts` (`updateDeviceVoipToken`), `Types/device` voipToken, `IncomingCallNotification` (`callType:'incoming'`) | **No equivalent — in-tab only.** Incoming calls arrive only via the live socket while a tab is open (backend quirk 5). Drop VoIP token registration. |
| Native push notifications (notifee) | `useThreadUpdates.tsx` `onDisplayNotification`, `Hooks/useNotifications.tsx`, `useGetNotificationToken.tsx` | Browser Notifications API while the tab is foregrounded; no background push (out of scope). |
| Haptics / native audio session | `useCallSocketUpdates.ts` (`expo-haptics`), `Contexts/AudioContext`, `useOutputDevice.ts` | Drop haptics; use `HTMLAudioElement`/WebAudio for SFX; `navigator.mediaDevices` for output device selection. |
| RN UI primitives + navigation | everything under `Screens/`, `Elements/`, `Components/`, `Contexts/ActiveCall/FloatingCall.tsx`, React Navigation | DOM + Tailwind + shadcn/ui; Next.js App Router. UI is **not** a reuse target — only the logic layers above are. |
| `react-native-config` env | `frontend/src/Constants/api.ts` (`Config.API_URL`, `SOCKET_URL`, `AGORA_APP_ID`, ...) | `process.env.NEXT_PUBLIC_*` / server env. |

---

## 3. Files to open first (in order)

1. `frontend/src/Constants/api.ts` — the complete endpoint inventory in one file; the fastest way to map every REST call.
2. `frontend/src/Types/message/index.ts` and `frontend/src/Types/threads/index.ts` — the core `Message` and `Thread` shapes everything revolves around (note: a conversation = many per-user Thread docs sharing `topicId`, backend quirk 4).
3. `frontend/src/Services/message.ts` — the richest contract surface (chat + email + reactions + seen/delivered + forward).
4. `frontend/src/Classes/SocketManager.ts` + `frontend/src/Contexts/Socket/SocketContext.tsx` — the connection/room/event-fanout engine to adapt for `socket.io-client` on web.
5. `frontend/src/Hooks/Socket/useThreadUpdates.tsx` + `useMessageUpdates.tsx` — the event-to-store mapping with batching/dedupe; rehost onto the Query cache.
6. `frontend/src/Hooks/Apis/useThreads.tsx` — a model TanStack-Query data hook (pagination + pinned merge) to mirror across the other `Hooks/Apis/*`.
7. `frontend/src/Redux/slices/activeCall.ts` + `frontend/src/Contexts/ActiveCall/hooks/useCallSocketUpdates.ts` — the call state machine (`CallStatus`) and the `SocketMessages` event mapping; pair with `frontend/src/Services/AgoraService.ts` as the Agora interface blueprint.
8. `frontend/src/Redux/slices/messages.ts` + `frontend/src/Redux/slices/app.ts` — the optimistic/temp-id reducers and the typing-info state shape, to translate into Zustand + optimistic mutations.

---

## 4. Caveats / things to confirm against source

1. **`refId` idempotency mismatch.** The backend is the ground truth: `backend/src/messages/dtos/sendMessage.dto.ts` documents `refId` as a client-generated **UUID v4, required for send idempotency** (a retry with a known `refId` returns the existing message), and `backend/src/messages/compose.service.ts` keys idempotency on it. **The RN client does NOT send `refId`** — `frontend/src/Types/message/request.ts` `RequestSendMessagePayload` has no `refId`, and it uses a client `messageId` as the temp id, swapping it on the server response (`updateMessageBasedOnThreadIdFormTemp`). For `unsendnext`, generate a UUID `refId` per send and include it (per backend quirk 3) — do not copy the RN temp-id approach blindly. Confirm the field name against the OpenAPI spec / `compose.service.ts`.
2. **Loosely-typed responses.** Several Service calls return `unknown`/`any` or inline anonymous types (e.g. `openNewThread` -> `unknown`, `getMessageHtml` -> `{_id, html}`, `setMessagesAsDelivered`). Where OpenAPI yields `any`, trust the RN `Services/` inline types as the practical contract, and verify.
3. **Two upload paths exist.** `Services/attachment.ts` (multipart: start / per-part presigned url / complete) and `Services/upload.ts` (single-shot presign+PUT+create). Pick one for web (multipart for large media); both ultimately presign + PUT + register the attachment.
4. **Socket transports.** RN `SocketManager.ts` sets `transports: ['websocket','polling']`; the gateway is websocket-only — set `['websocket']` only on web.
5. **The "join => event named after the room" quirk** (backend quirk 1) is implicit in RN: `SocketManager.joinRoom` emits `join <roomId>`, and `SocketContext` joins the user's `userId` room on connect. On web, register an `on(roomName, ...)` listener for any room you join, matching this behavior.
6. **Presence** is not handled in the RN socket hooks reviewed here; honor the symmetric-privacy rule (backend quirk 2) when implementing it — see `03-websocket-events.md`.
