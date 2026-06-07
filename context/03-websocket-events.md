# 03 — WebSocket Events Reference

> Purpose: the complete, source-grounded contract for the Socket.IO gateway that unsendnext consumes — connection/handshake, client→server events, server→client events, and the two non-obvious behaviors (dynamic event names and symmetric presence privacy).

All facts below are read from the backend gateway and services. Where a payload field is typed `any` on the backend, that is flagged explicitly — confirm exact shapes against the RN portable layer (`frontend/src/`) or `05-data-models.md`.

Primary sources:
- `backend/src/sockets/sockets.gateway.ts` — all `@SubscribeMessage` handlers, connection lifecycle, presence broadcasts.
- `backend/src/sockets/sockets.service.ts` — handshake authentication.
- `backend/src/sockets/send.service.ts` — internal `'sockets'` / `'broadcast'` / `'socket-direct'` event bus → real emits.
- `backend/src/types/socketEvent.ts`, `backend/src/types/socket.ts` — `SocketEvent` enum and `ISocket<T>` envelope.
- Reference client behavior: `frontend/src/Classes/SocketManager.ts`, `frontend/src/Contexts/Socket/SocketContext.tsx`, `frontend/src/Hooks/Socket/*`.

Related files: chat data-flow in `06-feature-chat.md`; call signaling in `08-feature-calls.md`; entity shapes in `05-data-models.md`.

---

## 1. Connection & handshake

### URL and transport

```
const socket = io(SOCKET_URL, { transports: ['websocket'] });
```

- The gateway is declared `@WebSocketGateway({ transports: ['websocket'], cors: true })` (`sockets.gateway.ts:27`). **Use `transports: ['websocket']` only.** Do not enable the long-polling fallback — the server does not advertise it. (Note: the RN `SocketManager.ts:72` currently lists `['websocket', 'polling']`; for unsendnext follow the gateway and use websocket-only.)
- It is a plain Socket.IO server mounted on the same Nest HTTP server (default port `3000`). It is **not** under the REST `'/api/v1'` global prefix. Connect to the server origin / default Socket.IO path (`/socket.io`).
- `cors: true` — any origin may connect.

### Authentication (token at handshake)

`SocketsService.authenticate()` (`sockets.service.ts:10`) reads the JWT from **`client.handshake.headers.authorization`** and verifies it with `jwt.verify(token, JWT_SECRET)`, then loads the user by `username` claim. On any failure (`!token`, verify throws, user not found) it calls `client.disconnect()`.

| Detail | Value |
|---|---|
| Token location read by server | `handshake.headers.authorization` (the raw JWT string) |
| Token format | The verified JWT itself — **no `Bearer ` prefix** is stripped; pass the bare token. |
| On failure | `client.disconnect()` (you will see a `connect_error` / immediate disconnect) |
| Re-auth | Handlers lazily re-authenticate (`client['user'] || authenticate(client)`) so a missing/expired token surfaces later too |

Two layers run on connect: `io.use(...)` middleware in `afterInit()` (`sockets.gateway.ts:49`) authenticates once and attaches `socket['user']`, and `handleConnection()` authenticates again. The reference client sends the token both ways for safety:

```ts
io(SOCKET_URL, {
  transports: ['websocket'],
  extraHeaders: { Authorization: token }, // what the server actually reads
  auth: { token },                        // harmless extra; server ignores it
});
```

> **BFF note (unsendnext):** browsers cannot set arbitrary `extraHeaders` on the WebSocket upgrade the way RN can, and the JWT lives in an httpOnly cookie. Use the `/api/auth/socket-token` Route Handler to mint a short-lived JS-readable token, then pass it where the gateway looks. Because the gateway reads `handshake.headers.authorization`, verify in integration that the browser handshake actually carries it; if `extraHeaders` is not honored by the browser transport, this is a known gap to resolve against the BFF (see `04-auth-sessions-deviceid.md` / auth doc). Do **not** change the backend.

### Auto-joined rooms on connect

`handleConnection()` (`sockets.gateway.ts:63`) makes every socket join two rooms automatically:

1. **`client.id`** — a room named after the socket id (direct-to-socket addressing).
2. **`userId`** — a stable room keyed by the authenticated user's Mongo `_id` (string). This is the backbone of reliable delivery: all message create/update/delete receipts and `session:invalidate` are emitted into the recipient's `userId` room, so they land on every device/tab of that user regardless of which conversation is open. The client does **not** need to emit `join` for its own `userId` — it is automatic. (The RN client additionally re-emits `join(userId)` after connect, which is a harmless idempotent re-join; see `SocketContext.tsx:71`.)

Presence side effect: on connect, if this is the **first** socket for the `userId` (`fetchSockets().length === 1`), the server may broadcast `presence:online` — see §4.

---

## 2. Client → Server events

Emit via `socket.emit(eventName, payload)`. Several handlers `return` an ack object — read it via the Socket.IO ack callback (`socket.emit(event, payload, (ack) => ...)`).

| Event | Payload | Server behavior | Ack return |
|---|---|---|---|
| `join` | `string` (room) **or** `{ channelName: string }` | Joins the room. Then emits an event **whose name equals the room** into that room (see §3 / §5). | `{ ok: true, room }` |
| `leave` | `string` (room) | `client.leave(data)`. | `{ ok: true, room }` |
| `typing` | `{ channel: string, event: 'typing' \| 'stop-typing' }` | `channel` is a **topicId**. Resolves all participant `userId`s via that topic's per-user Thread docs (excluding the sender), then emits an event **named after `event`** (`'typing'` or `'stop-typing'`) into those recipients' `userId` rooms. No-op if `channel` or `event` missing. | none |
| `message` | `{ messageId: string, event: string }` | Fires internal `'seen-delivered'` with `updateQry = { [event]: true }`. `event` is a message boolean field name (e.g. `seen`). Legacy/loosely-typed path; prefer `ack:delivered` / `ack:read`. | none |
| `ack:delivered` | `{ messageIds: string[] }` | Marks those messages delivered for the acking user (`setBulkMessagesDelivered`). Skips self-authored messages. Tags `socketId = client.id` so the resulting receipt emit excludes this socket. | `{ ok: true, count }` or `{ ok: false, error: 'messageIds required' }` |
| `ack:read` | `{ threadId: string }` | Marks all unread messages in that **thread** read+delivered for the acking user (`setThreadMessagesSeenAndDelivered`). Tags `socketId` to exclude the acking socket from the echo. | `{ ok: true }` or `{ ok: false, error: 'threadId required' }` |
| `presence:subscribe` | `{ usernames: string[] }` | Resolves each username → userId and joins `presence:<userId>` rooms so you receive that user's online/offline events. **Symmetric privacy + opt-out filtering apply** (see §4). Unknown usernames silently skipped. | `{ ok: true, count }` (count = rooms actually joined; `0` if you opted out) |
| `presence:unsubscribe` | `{ usernames: string[] }` | Leaves the matching `presence:<userId>` rooms. | `{ ok: true, count }` |
| `update-call` | `{ callUUID: string, payload: Partial<ICallNotificationPayload> }` | Updates the call's `type` to VIDEO/VOICE from `payload.isVideoCall`. Errors are swallowed (logged). | none |
| `call-received` | `{ callUUID: string, channelName: string }` | Idempotently stamps `receivedAt` and, **only on first receipt**, the service broadcasts `call-received` into the `channelName` room so the caller learns the callee's device got it. | none |
| `call-started` | `string` (the `callUUID`) | `updateCallStarted(callUUID)`. Unknown/already-ended call → debug log, no error. Note payload is a **bare string**, not an object. | none |
| `end-call` | `{ channelName: string, callUUID: string }` | Computes who is left in the `channelName` room, decides ENDED/MISSED/FAILED/DECLINED + duration, persists it, updates the call message, may send a missed-call push, and broadcasts `call-ended` into the room **excluding the sender's socket**. Group-call rules apply (only ends-for-all under specific conditions — see `08-feature-calls.md`). | none |
| `camera-on-invitation` | `{ channelName: string, callUUID: string }` | Re-emits `camera-on-invitation` into the `channelName` room **excluding the sender** (a voice→video upgrade invite). | none |
| `ping` | _none_ | Replies `pong` to the requesting socket only. Application-level heartbeat; distinct from Socket.IO's built-in ping. | none (server emits `pong`) |

Notes:
- Many handlers' `@MessageBody() data` are typed `any` on the backend; the shapes above are reconstructed from handler bodies and from the RN `SocketMessages`/`SocketMessagePayloads` types in `frontend/src/Types/socket/index.ts`. Treat RN as the corroborating source for call payloads.
- `excludedSocketId` exclusion only works if the server knows your socket id for the receipt. `ack:delivered`/`ack:read` set it from `client.id` automatically; the REST send path relies on the `socketId` header (see `06-feature-chat.md`).

---

## 3. Server → Client events

Listen via `socket.on(eventName, handler)`.

### Static / well-known events

| Event | Payload | When |
|---|---|---|
| `presence:online` | `{ userId: string, username: string }` | A subscribed user's **first** socket connects (and they did not opt out). Delivered only into `presence:<userId>` rooms you joined via `presence:subscribe`. |
| `presence:offline` | `{ userId: string, username: string, lastSeenAt?: string }` | A subscribed user's **last** socket disconnects. `lastSeenAt` (ISO string) is present only if their `showLastSeen !== false`. |
| `call-ended` | `{ channelName: string, callUUID: string }` | A peer ended the call (from `end-call`, excludes the ender's own socket). The RN type also documents `isStarted`/`duration` fields — confirm against `08-feature-calls.md`; the gateway message object here carries `{ channelName, callUUID }`. |
| `camera-on-invitation` | `{ channelName: string, callUUID: string }` | A peer turned their camera on / invited you to upgrade voice→video (excludes the inviter). |
| `call-received` | `{ callUUID: string, channelName: string }` | Emitted into the call's `channelName` room when the callee's device acknowledges receipt (so the caller can show "ringing"). |
| `pong` | `{ message: 'pong' }` | Reply to your `ping`. |
| `session:invalidate` | `{ deviceId?: string, reason: string }` | Forced logout: a device/session was revoked (admin action, "log out other sessions", etc.). Emitted into the `userId` room. The reference client clears tokens and disconnects (`SocketContext.tsx:124`). `reason` values seen: `device_deleted_by_admin`, `all_devices_deleted_by_admin`, `other_sessions`, `all_sessions`. |
| `user-avatar-updated` | `{ username: string, version: number }` | Broadcast to **all** sockets (except the updater) when a user changes their avatar; bump cache-busting `version`. |
| `user-profile-updated` | profile payload | Profile change broadcast (`SocketEvent.userProfileUpdated`). Confirm exact payload in `users.service.ts` before relying on fields. |

> **No literal `message:delivered` / `message:read` wire events exist.** Despite the task brief naming them, the gateway and `messages.service.ts` deliver read/delivery receipts as `update` events (see below). Document and implement them as `update`. The `ack:delivered` / `ack:read` events are the *client→server* triggers; the resulting *server→client* receipt is an `update`.

### Message / thread events — `create`, `update`, `delete`

New messages, message edits, and delivery/read receipts are all delivered as one of three generically-named events, with the full entity in the payload:

| Event | Payload | Meaning |
|---|---|---|
| `create` | `IMessage` (or `IThread<IMessage>` for thread events) | A new message (or a new/updated thread summary). |
| `update` | `IMessage` / `IThread<IMessage>` | A message changed — **including delivery (`isDelivered`) and read (`isRead`/`readInfo`) receipts**, voice-note "listened", etc. |
| `delete` | `{ messageId, ... }` | A message was deleted (RN sets `isDeleted = true`). |

These are emitted into the recipient's **`userId` room** via the internal `'sockets'` bus (`ISocket<T>` envelope: `{ room, message, event, excludedSocketId }`) — see `messages.service.ts` (`emit('sockets', ...)` at lines ~590, ~600, ~827, ~1085) and the `SocketEvent` enum (`create`/`update`/`delete`). The reference client disambiguates message-vs-thread payloads by inspecting fields (`headerId`+`messageId` ⇒ message; `lastMessage` w/o `headerId` ⇒ thread) — `useMessageUpdates.tsx:104`.

Client listener pattern (RN, portable to unsendnext): subscribe **once** to the generic names, not per-conversation:

```ts
on('create', handleCreate);
on('update', handleUpdate);   // this is also where read/delivered receipts arrive
on('delete', handleDelete);
```

### Dynamic per-room events

In addition, the server emits events whose **name is computed at runtime** (a room name or a `typing`/`stop-typing` literal). These are covered in detail in §5.

| Dynamic event name | Payload | Source |
|---|---|---|
| `<roomName>` (the exact room you just joined) | `{ name: string, eventType: 'Joined' }` | `join` handler broadcasts into the room using the room name as the event name. |
| `typing` / `stop-typing` | `{ name, userId, event, channel, createdAt }` | `typing` handler emits an event named after the incoming `event` field. |

---

## 4. Symmetric presence privacy (exact semantics)

Presence is governed by the user's `showOnlineStatus` flag (and `showLastSeen` for the offline timestamp). The rule is **symmetric**: a user who hides their own status also loses the ability to see anyone else's.

Three enforcement points in `sockets.gateway.ts`:

1. **Broadcasting your own online state — `handleConnection()` (`:82`).**
   On your first socket, the server looks up your user. If `showOnlineStatus === false` it stays silent (no `presence:online`). Otherwise it emits `presence:online { userId, username }` into the `presence:<userId>` room (only subscribers receive it). First-socket detection: `fetchSockets()` includes the just-joined socket, so first === `length === 1`.

2. **Broadcasting your own offline state — `handleDisconnect()` (`:102`).**
   Fires only when your **last** socket disconnects (post-disconnect count, computed by filtering out the disconnecting `client.id`, must be `0`). It always `markLastSeen(userId)`. Then: if `showOnlineStatus === false`, **no** `presence:offline` is emitted. Otherwise it emits `presence:offline { userId, username }`, and includes `lastSeenAt` (ISO) **only if `showLastSeen !== false`**.

3. **Receiving others' presence — `presence:subscribe` (`:273`).** Two filters:
   - **Requester opt-out (the symmetric part):** if **you** (`client['user']`) have `showOnlineStatus === false`, the handler returns `{ ok: true, count: 0 }` immediately and joins **no** rooms. You will never receive any presence events for anyone. This is the symmetry: opting out of broadcasting forfeits all visibility.
   - **Target opt-out:** for each requested username, if that target has `showOnlineStatus === false`, they are skipped (no room joined) — they will never emit anyway. Unknown usernames are silently skipped. `count` reflects rooms actually joined.

| Your `showOnlineStatus` | Target `showOnlineStatus` | You broadcast online/offline? | You can subscribe to them? |
|---|---|---|---|
| `true`/unset | `true`/unset | Yes | Yes |
| `true`/unset | `false` | Yes | No (target skipped) |
| `false` | any | No | No (subscribe is a no-op, `count: 0`) |

Implications for unsendnext:
- Always emit `presence:subscribe { usernames: [...] }` for the conversations/contacts on screen, and `presence:unsubscribe` when they leave the viewport (rooms persist for the socket lifetime otherwise).
- If `presence:subscribe` acks `count: 0` while you passed usernames, the current user has likely opted out — render no presence rather than "offline".
- You only get presence for the window your tab is open (no background updates).

---

## 5. The dynamic-event-name quirk (room name == event name)

This is the single most surprising part of the gateway. **There is no generic `roomMessage` event.** When the server emits into a room, it sometimes uses a *runtime-computed string* as the event name.

### 5a. `join` → event named after the room

`handleSubscribe()` (`sockets.gateway.ts:144`) accepts either a string room or `{ channelName }`, joins it, then:

```ts
this.io.sockets.in(room).emit(room, {        // event NAME === room name
  name: client['user'].username || '',
  eventType: 'Joined',
});
```

So if you `socket.emit('join', '<topicId>')`, every member of that room — including you — receives an event literally named `<topicId>` with payload `{ name, eventType: 'Joined' }`. To observe joins for a room you must register a listener **keyed by that exact room string**:

```ts
socket.emit('join', topicId);
socket.on(topicId, (data) => {
  // data === { name: 'someusername', eventType: 'Joined' }
});
```

You cannot pre-register a static listener for "someone joined" — the event name is whatever room you joined (a topicId, threadId, channelName, or call channel). Register the listener dynamically when you join, and remove it when you `leave`.

### 5b. `typing` → event named after the `event` field

`handleTyping()` (`sockets.gateway.ts:182`) emits using the **incoming `event` string** as the event name into recipients' `userId` rooms:

```ts
this.io.sockets.in(recipientIds).emit(event, payload); // event = 'typing' | 'stop-typing'
```

These two names are fixed, so the client listens on the literals `'typing'` and `'stop-typing'` (`useTypingIndicator.tsx:90`). Payload: `{ name, userId, event, channel, createdAt }` where `channel` is the topicId.

### Why it matters for unsendnext

- The generic `create`/`update`/`delete` listeners (§3) carry actual message/thread data and are how you build the chat UI. The **dynamic room-named events are mostly join/presence-in-room signals**, not message payloads.
- Maintain a small registry: when `useRoomManagement`-style logic joins a room (topicId/threadId/channelName), attach a listener for that exact name; on leave, detach it. The SocketManager's `on(event, cb)` already supports arbitrary event strings (`SocketManager.ts:195`), so a dynamic name is just `on(roomName, cb)`.
- Do not assume `emit(room, ...)` means "message in room." For chat content, rely on `create`/`update`/`delete` into your `userId` room. For call control, rely on the call-specific events into the `channelName` room. See `06-feature-chat.md` and `08-feature-calls.md`.

---

## 6. Quick client lifecycle (reference)

1. Connect with token at handshake (`transports: ['websocket']`).
2. Server auto-joins `client.id` and `userId` rooms; you may receive `presence:online` if subscribers exist.
3. Subscribe to generic data events: `create`, `update`, `delete`, `typing`, `stop-typing`, `session:invalidate`, `user-avatar-updated`.
4. For presence: `presence:subscribe { usernames }`; listen for `presence:online` / `presence:offline`.
5. Per open conversation: `join` the topicId/threadId; register a listener for that exact room-name string (join signals); `ack:read { threadId }` when viewed; `ack:delivered { messageIds }` on arrival.
6. For calls: `join` the `channelName`; emit/listen `call-received`, `call-started`, `camera-on-invitation`, `end-call`/`call-ended`, `update-call` (see `08-feature-calls.md`).
7. Optional `ping` → `pong` heartbeat (Socket.IO already has its own).

---

## 7. Caveats / open items

- Backend `@MessageBody()` is `any` on most handlers; the payload shapes here are derived from handler logic + RN types, not DTOs. Validate against `frontend/src/Types/socket/index.ts` and `05-data-models.md`.
- The brief's `message:delivered` / `message:read` event names do **not** exist on the wire — receipts arrive as `update`. Implement accordingly.
- `call-ended` payload: gateway sends `{ channelName, callUUID }`; RN's `SocketMessagePayloads` additionally types `isStarted`/`duration`. Reconcile in `08-feature-calls.md` before depending on those fields.
- Browser handshake header delivery: the gateway reads `handshake.headers.authorization`. Confirm the browser WebSocket transport actually forwards this header from the BFF-minted socket token; if not, that is an integration gap to solve on the client/BFF side — the backend must not be modified.
- Web limitation: incoming calls and all realtime updates only work while a tab is open (no VoIP/background push). Out of scope per product constraints.
