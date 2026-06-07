# 10 - State & Realtime Architecture

**Purpose:** Define how `unsendnext` (the Next.js web client) holds client state and reconciles realtime socket events: TanStack Query v5 as the normalized cache of server entities, Zustand for ephemeral state, a single socket manager that writes gateway events into the Query cache, optimistic updates keyed by `refId`, and reconnect/delta-sync via the three sync cursors.

This file describes the **web** design. It is synthesized from the proven RN shape — see `frontend/src/Classes/SocketManager.ts`, `frontend/src/Contexts/Socket/SocketContext.tsx`, `frontend/src/Hooks/Socket/*`, `frontend/src/Hooks/Apis/useThreadSync.tsx`, `frontend/src/Hooks/Apis/useCallSync.tsx`, and `frontend/src/Redux/slices/*` — mapped onto TanStack Query + Zustand instead of Realm + Redux. For the raw socket transport, handshake, and event catalogue see `03-websocket-events.md`. For entity shapes (Thread, Message, Call) see `05-data-models.md`. For chat UI wiring see `06-feature-chat.md`; for calls see `08-feature-calls.md`.

---

## 1. The two-layer model

| Layer | Library | Holds | Lifetime | Source of truth for |
|---|---|---|---|---|
| **Server cache** | TanStack Query v5 | threads, messages, contacts, calls, profile | Persists across navigation; GC'd by `gcTime` | All **server entities**. Socket events and mutations write *into* this cache. |
| **Ephemeral state** | Zustand | socket status, typing map, presence map, active-call state, composer drafts | In-memory; cleared on logout/tab close | Transient/derived UI state that is **not** a server entity. |

Hard rule: **the Query cache is the single source of truth for server entities.** Socket events do not get their own store — they are reconciled into the Query cache. Zustand only holds state that has no canonical server representation in cache (e.g. "who is typing right now"). This mirrors the RN split where Realm held entities and Redux slices (`app.ts`, `activeCall.ts`, `chatInputForm.ts`) held ephemeral UI state.

On the web there is no Realm and no background process: when the tab closes, ephemeral state is gone and the Query cache is whatever survives (optionally persisted via `@tanstack/query-persist-client`; not required for parity). See multi-tab notes in §8.

---

## 2. TanStack Query — server entities

### 2.1 Query-key conventions

Use structured array keys so we can invalidate/patch at any granularity. Proposed convention (ground these against the real endpoint inventory in `02-backend-rest-api.md` / `03-websocket-events.md`):

| Entity | Query key | Backing endpoint (REST base `/api/v1`) |
|---|---|---|
| Thread list (paginated) | `['threads', 'list']` (infinite) | `GET /threads/...` paginated metadata (`threads.controller.ts`) |
| Single thread | `['threads', 'detail', threadId]` | `GET /threads/:id` |
| Messages in a thread (infinite) | `['messages', 'thread', threadId]` | `GET /messages/thread/:id/before/:cursor/size/:size` |
| Message reactions | `['messages', 'reactions', messageId]` | `GET /messages/.../reaction...` |
| Contacts | `['contacts', 'list']` | `contacts.controller.ts` |
| Call history (infinite) | `['calls', 'history']` | `GET /calls/...history` (`calls.controller.ts`) |
| Single call | `['calls', 'detail', callUUID]` | `GET /calls/:uuid` |
| My profile / settings | `['me']`, `['settings']` | `users` / `settings` controllers |

Conventions:
- **Prefix by entity, then by view.** `['messages', 'thread', threadId]` lets us patch one thread's message list without touching others, and invalidate `['messages']` wholesale on a full resync.
- **One canonical key per list.** Do not duplicate the same server list under two keys; derive UI variants with `select`.
- **IDs as the last key segment**, never interpolated into a string (so partial-match invalidation works).

### 2.2 Infinite queries for pagination

Both message history and the thread list use `useInfiniteQuery`. The backend message pagination is **cursor-based** (`/thread/:id/before/:cursor/size/:size`), which is stable against new messages arriving mid-scroll (the offset variant `.../page/:page/size/:size` is deprecated — see `messages.controller.ts`). Use the returned "before" cursor as `getNextPageParam`; newest page is `pages[0]`.

Important interaction with realtime: a newly received message (socket `create`) is **prepended to page 0** of `['messages', 'thread', threadId]`, not appended to the last page. Optimistic sends do the same. Keep page 0 as the "live head" of the conversation.

### 2.3 What is `any`

The three sync DTOs (`backend/src/threads/dtos/sync-threads.dto.ts`, `messages/dtos/sync-messages.dto.ts`, `calls/dtos/sync-calls.dto.ts`) type their entity arrays as `any[]` (`threads: any[]`, `messages: any[]`, `calls: any[]`). The generated OpenAPI client will surface these as `any`. **Confirm the real row shapes against `05-data-models.md` and the RN `frontend/src/Types/` + `frontend/src/Services/` layer** before relying on fields; do not assume the example payloads in the DTOs are exhaustive.

---

## 3. Zustand — ephemeral state

One store (or a few slices) holding only transient state. Modeled on the RN Redux slices, minus anything that is a server entity.

| Slice | RN origin | Fields (web) |
|---|---|---|
| **Connection** | `SocketContext` `isConnected`/`socketId` | `status: 'idle'\|'connecting'\|'connected'\|'reconnecting'`, `socketId` |
| **Typing** | `app.ts` `typingInfo` | `typing: Record<channel, Record<userId, { name; startedAt; lastSeen }>>` |
| **Presence** | (new; from gateway `presence:*`) | `presence: Record<userId, { online: boolean; username; lastSeenAt? }>` |
| **Active call** | `activeCall.ts` | `activeCallUUID`, `topicId`, `callStatus`, `participants`, `peerIds`, media flags, `agoraToken`, `channelName`, `incomingCalls` map |
| **Composer drafts** | `chatInputForm.ts` | per-thread `chatInput`, `replyTo`, `toList/ccList/bccList`, `subject`, compose flags |

Notes:
- **Typing map** is keyed by `channel` (= `topicId`) then `userId`, exactly as RN `app.ts` `addTypingUser`/`removeTypingUser`. Entries are self-expiring on the web too: a typing entry should be dropped after a short TTL if no refresh arrives (the gateway only emits a discrete `typing`/`stop-typing` event; there is no server-side expiry).
- **Presence map** is new ephemeral state because presence is not a queryable entity — it only arrives over the socket (`presence:online` / `presence:offline`). REST `GET /presence` (`presence.controller.ts`) seeds the initial snapshot; socket events keep it live. Respect symmetric privacy (quirk #2, §6).
- **Active call** is ephemeral and **does not survive a tab close** (quirk #5). The Query cache still records the *historical* call (`['calls', ...]`), but the in-progress Agora session lives only in Zustand. See `08-feature-calls.md`.
- **Composer drafts** are per-thread; on web, persist drafts to `localStorage` keyed by `threadId`/`topicId` so a refresh doesn't lose an unsent message (RN persisted only blocked/reported lists via `appPersistConfig`).

---

## 4. The single socket manager

Exactly one Socket.IO connection per tab, owned by a singleton — the web port of `frontend/src/Classes/SocketManager.ts` (a `getInstance()` singleton) wrapped by a React provider (`SocketContext.tsx`).

Web-specific deltas from the RN manager:
- **Transports: `['websocket']` only** (the gateway is `transports: ['websocket']`; do **not** include the `'polling'` fallback the RN code uses).
- **Handshake auth:** pass the short-lived JS-readable token from the BFF route `/api/auth/socket-token` in `auth: { token }` (the gateway authenticates once at handshake — `sockets.gateway.ts` `afterInit` `io.use(...)`). httpOnly cookies cannot be read by JS, hence the dedicated token route. See `02-backend-rest-api.md`.
- **Keep Socket.IO's built-in reconnect** (`reconnection: true`); do not reimplement queuing/heartbeats. The RN manager already trusts this.
- **Re-join rooms on (re)connect.** The manager tracks `joinedRooms` and re-emits `join` for each on `connect`/`reconnect` (`SocketManager.rejoinRooms`). This is required because the server only auto-joins the per-socket id room and the stable `userId` room on connect (`handleConnection`); all other rooms (thread/topic) must be re-joined by the client.

### Provider responsibilities (Zustand-bound)
- Set connection `status` in Zustand on `connect`/`disconnect`/reconnect attempts.
- On `connect`: join the user room (`userId`), re-join open rooms, and **kick off delta-sync** (§7).
- Expose `on(event, cb)`, `emit`, `joinRoom`, `leaveRoom`. Each feature hook (chat, presence, typing, calls) subscribes via `on` and writes results into the Query cache or the relevant Zustand slice.
- Handle `session:invalidate` → clear tokens + cache + disconnect (RN `handleSessionInvalidate`).

---

## 5. Event → cache reconciliation

The gateway emits over the authenticated user's **`userId` room** for entity changes, excluding the originating socket via `excludedSocketId` (so the sender's own tab does not get an echo of its own change — see `compose.service.ts`, `messages.service.ts`). Each event is reconciled into the Query cache (or a Zustand slice for ephemeral signals).

### 5.1 The shared-name quirk: `create` / `update` / `delete`

Both **message** events and **thread** events are emitted under the **same event names** `create`, `update`, `delete` (`SocketEvent` enum in `backend/src/types/socketEvent.ts`). They are distinguished only by **payload shape**, exactly as the RN hooks do (`useMessageUpdates.tsx`, `useThreadUpdates.tsx`):

- **Message payload:** has `headerId` **and** `messageId`.
- **Thread payload:** has `lastMessage` **and no** `headerId`.

A single listener per event name must branch on shape and route to the correct cache key. Register `create`/`update`/`delete` once each and dispatch internally; do not assume "create == message".

### 5.2 The dynamic-event-name quirk (room name == event name)

When a client emits `join` for a room, the gateway replies by emitting an event **whose name equals the room name** (`io.sockets.in(room).emit(room, { name, eventType: 'Joined' })` in `sockets.gateway.ts` `handleSubscribe`). The client therefore must register a listener **keyed by the exact room string it joined** to observe join acks / room-scoped broadcasts. There is no fixed `'joined'` event — the event name is data. The socket manager's `joinRoom(room)` should pair with an `on(room, ...)` registration when the caller needs those room-keyed messages. (See `03-websocket-events.md` for the full event catalogue.)

### 5.3 Reconciliation table

| Gateway event | Payload discriminator | Reconcile into | Action |
|---|---|---|---|
| `create` (message) | `headerId` + `messageId` | `['messages', 'thread', threadId]` (infinite) + `['threads','list']` | If `refId` matches a pending optimistic entry → replace it (§6). Else prepend to page 0 (dedupe by `messageId`/`refId`). Bump thread's `lastMessage`/order. |
| `create` (thread) | `lastMessage`, no `headerId` | `['threads','list']` + `['threads','detail',threadId]` | Upsert thread; insert into list in sorted position. |
| `update` (message) | `headerId` + `messageId` | `['messages','thread',threadId]` | Patch the matching message in place by `messageId` (covers edits, reactions, seen/delivered receipts, voice-listened). Apply only if newer (`updatedAt`) — see §5.4. |
| `update` (thread) | `lastMessage`/thread fields | `['threads','list']`, `['threads','detail',...]` | Patch thread (subject, lastMessage, unread). |
| `delete` (message) | `messageId` | `['messages','thread',threadId]` | Mark `isDeleted: true` in place (soft delete; do not remove the row — RN keeps the tombstone). |
| `delete` (thread) | `threadId` | `['threads','list']` | Remove thread from list / mark deleted. |
| `typing` | `{ channel, userId, name, event }` | Zustand typing slice | Add/refresh typing entry for `(channel,userId)`. |
| `stop-typing` | `{ channel, userId }` | Zustand typing slice | Remove entry; clear channel if empty. |
| `presence:online` | `{ userId, username }` | Zustand presence slice | Mark user online. |
| `presence:offline` | `{ userId, username, lastSeenAt? }` | Zustand presence slice | Mark offline; store `lastSeenAt` if present. |
| `call-received` | `{ callUUID, channelName }` | Zustand active-call + `['calls','detail',uuid]` | Caller side: receiver got the invite → set `Ringing`. |
| `call-ended` | `{ callUUID, channelName }` | Zustand active-call + `['calls','history']` | Tear down Agora session; invalidate/patch call history. |
| `camera-on-invitation` | `{ channelName, callUUID }` | Zustand active-call | Show video-call invitation. |
| `session:invalidate` | `{ deviceId?, reason }` | — | Force logout (clear tokens + caches + disconnect). |
| `user-avatar-updated` / `user-profile-updated` | profile fields | `['me']` / contacts / cached author refs | Patch cached user/profile data. |

Receipts note: delivered/read acks are driven by the client emitting `ack:delivered` / `ack:read` (and the `message` event for per-flag seen/delivered) — see `sockets.gateway.ts`. The server tags the requesting socket so the resulting receipt `update` is **not echoed back to the acking tab**; other tabs/devices receive it.

### 5.4 Ordering & idempotency guards (port from RN)

The RN hooks guard against duplicate/out-of-order socket delivery; replicate these when writing to the cache:
- **Last-writer-wins by `updatedAt`:** skip an `update` whose `updatedAt` is older than the cached row (`isNewer` in `useMessageUpdates`/`useThreadUpdates`).
- **Recently-processed dedupe:** a short-TTL set keyed by `messageId`/`threadId` (RN uses ~2s) to drop duplicate deliveries racing the REST mutation response.
- **Batching:** RN debounces socket writes (~50ms messages, ~150ms threads) to coalesce bursts. On web, prefer batching cache writes (e.g. a microtask/`setTimeout` flush) so one `setQueryData` pass handles a burst rather than re-rendering per event.

---

## 6. Optimistic updates with `refId` reconcile

Every chat send carries a **client-generated `refId` (UUID v4)** in the `SendMessageDto` (`backend/src/messages/dtos/sendMessage.dto.ts`). The backend is **idempotent on `(userId + refId)`** (quirk #3): a retry with the same `refId` returns the existing message instead of creating a duplicate, and the send handler skips re-incrementing counts on an idempotent replay (`messages.controller.ts`, `isIdempotentReplay`). The send response (`send-message-response.dto.ts`) echoes the `refId` and the real `messageId`.

This makes `refId` the join key between the optimistic row, the REST response, and the socket `create` echo.

### Send flow (`useMutation` with optimistic update)
1. **Generate `refId = crypto.randomUUID()`.** Build a temp message `{ refId, messageId: <temp>, status: 'sending', createdAt: now, ... }`.
2. **`onMutate`:** `cancelQueries(['messages','thread',threadId])`, snapshot previous, then `setQueryData` to **prepend the temp message to page 0**. Patch `['threads','list']` lastMessage/order. (RN equivalent: `addMessageBasedOnThreadId` then `updateMessageBasedOnThreadIdFormTemp`.)
3. **POST `/messages`** with `refId` and the current `socketId` header (`socketid` / `x-socket-id`) so the server can exclude this tab's socket from the echo.
4. **`onSuccess`:** replace the temp row with the server message **matched by `refId`** (set real `messageId`, `status: 'sent'`). Idempotent — safe even if the socket `create` already arrived.
5. **`onError`:** mark the temp row `status: 'failed'` (keep it, RN renders a retry affordance — `FailedMessage.tsx`). Retry **reuses the same `refId`** so the backend dedupes.
6. **Socket `create` echo** (other devices, or this tab on race): the reconciler in §5.3 matches on `refId` first; if the optimistic/real row already exists it patches in place instead of inserting a duplicate.

### Edit / delete / react
These have no `refId` (they target an existing `messageId`/`headerId`), so reconcile by id:

| Action | REST (see `messages.controller.ts`) | Optimistic patch | Socket echo |
|---|---|---|---|
| **Edit** | `PATCH /messages/message/:id` | Patch `text`, set `edited: true` in cache | `update` (message) — patch in place |
| **Delete for all** | `DELETE /messages/message/:id` | Set `isDeleted: true` (tombstone, don't remove) | `delete` (message) |
| **Delete for me** | `DELETE /messages/forMe` (`headerIds`) | Remove locally for this user | (local; no broadcast to others) |
| **React** | `POST /messages/message/:id/reaction/:reaction` | Add/replace this user's reaction in cache | `update` (message) carrying full `reactions[]` |
| **Remove reaction** | `DELETE /messages/header/:id/reaction/:reactionId` | Remove this user's reaction | `update` (message) |

For edit/delete/react: snapshot in `onMutate`, patch, roll back to the snapshot in `onError`, and let the socket `update`/`delete` echo confirm. Because the same socket that sent the request is excluded from the echo, the optimistic patch is what the originating tab sees until the next sync.

---

## 7. Reconnect + delta-sync (the three cursors)

The backend exposes **three delta-sync endpoints**, each `lastSyncTime`-cursored and returning a fresh `syncTime` checkpoint:

| Cursor | Endpoint | Response DTO | Returns |
|---|---|---|---|
| Threads | `GET /threads/sync/:lastSyncTime` | `SyncThreadsResponseDto` | `threads[]` (created+updated), `deletedThreadIds[]`, `syncTime`, counts |
| Messages | `GET /messages/sync/:lastSyncTime` | `SyncMessagesResponseDto` | `messages[]` (created+updated), `deletedMessageIds[]` (**refIds** of soft-deletes), `syncTime`, **`hasMore`**, counts |
| Calls | `GET /calls/sync/:lastSyncTime` | `SyncCallsResponseDto` | `calls[]`, `deletedCallUUIDs[]`, `syncTime`, counts |

Source: `threads.controller.ts`, `messages.controller.ts`, `calls.controller.ts` and their DTOs. Each `lastSyncTime` must be an ISO-8601 timestamp (the messages/calls handlers `throw BadRequestException` on an unparseable value).

### When to run
Run all three sync passes on **any of**:
1. **Socket `connect` / `reconnect`** (after re-joining rooms).
2. **Tab returns to foreground** — `document.visibilitychange` → `visible` (the web analogue of RN's `AppState` `background → active` in `SocketContext`/`useThreadUpdates`).
3. **Browser `online` event** (network restored).

Debounce so the three triggers firing together (e.g. reconnect + foreground) don't launch overlapping syncs. RN uses a module-level `isSyncing` lock per cursor (`useThreadSync`, `useCallSync`); replicate a per-cursor in-flight guard.

### Merge algorithm (per cursor)
1. Read stored `lastSyncTime` (e.g. `localStorage`, one key per cursor — RN: `getLastSyncTime` / `getCallLastSyncTime`). If **absent → do a full initial load**, then set `lastSyncTime = now` (RN `performInitialSync` falls back to the paginated/history endpoints; for messages the RN flow bulk-fetches per updated thread).
2. `GET .../sync/:lastSyncTime`.
3. **Upsert** every row in `threads` / `messages` / `calls` into the Query cache (last-writer-wins by `updatedAt`; reuse the §5.4 guard).
4. **Drop deletes:** mark/remove rows in `deletedThreadIds` / `deletedCallUUIDs`; for messages, `deletedMessageIds` are **refIds** — match the cached row by `refId` and set `isDeleted` (tombstone).
5. **Advance the cursor:** persist the returned `syncTime` as the new `lastSyncTime` **only after** the merge succeeds (so a failed merge re-fetches the same window next time).
6. **Messages drain loop:** the messages sync paginates at 500 rows. While `hasMore === true`, immediately call again with the returned `syncTime` until `hasMore === false` (DTO description in `sync-messages.dto.ts`). Threads/calls sync are single-shot (no `hasMore`).

### Ordering on reconnect
Recommended order: **threads → messages → calls.** Threads first so the list/lastMessage shells exist; messages next to fill conversation history; calls last (independent). After sync, **re-join all open rooms** (the socket manager already does this on `connect`; ensure the active thread/topic rooms are in `joinedRooms`).

### Why sync is mandatory on web
While disconnected (tab backgrounded/throttled, network drop), the client misses live socket `create`/`update`/`delete` events entirely — web has no background delivery (quirk #5). Delta-sync is the only mechanism that backfills the gap. Treat it as the correctness backstop; socket events are the fast path.

---

## 8. Multi-tab considerations

Each browser tab is an **independent Socket.IO connection** with its **own `socketId`** and its **own Query cache + Zustand store**. The backend's stable `userId` room means **all of a user's tabs receive the same entity broadcasts** (`handleConnection` joins `userId`), so they converge — but they are not automatically in lockstep.

Implications and guidance:
- **Echo exclusion is per-socket, not per-user.** The tab that performed a send/edit/delete is excluded from the echo (`excludedSocketId`), but **other tabs of the same user DO receive** the `create`/`update`/`delete`. So tab A's optimistic write is confirmed locally, while tab B learns of it via the socket event and reconciles normally. No special handling needed beyond §5/§6 idempotency.
- **Presence first-socket rule:** the server only broadcasts `presence:online` on the **first** socket for a `userId` and `presence:offline` after the **last** one disconnects (`handleConnection`/`handleDisconnect` count sockets in the `userId` room). Opening/closing a second tab does **not** toggle your presence — correct, but means a single tab cannot infer "all my tabs closed."
- **Symmetric-privacy presence (quirk #2):** a user with `showOnlineStatus === false` neither broadcasts nor receives presence — `presence:subscribe` returns a no-op for them (`handlePresenceSubscribe`). The web presence slice must therefore tolerate **never** receiving any `presence:*` events and must not render "offline" as authoritative for such users; fall back to REST `GET /presence` semantics and the user's own privacy flag.
- **Active call is tab-local.** Only the tab that joined the Agora channel holds the live session in Zustand; other tabs see the call only as history. Do not try to share an Agora session across tabs.
- **Cross-tab cache sync (optional):** TanStack Query's `broadcastQueryClient` (BroadcastChannel) can mirror cache writes across tabs to reduce redundant refetch, but it is **not required** for correctness — each tab's independent socket + delta-sync already converges. Keep it optional to avoid coupling tabs.
- **Sync cursor storage is shared** (`localStorage` is per-origin, shared across tabs). Guard with the per-cursor in-flight lock (§7) so two tabs foregrounding at once don't double-advance the cursor; a `syncTime` advanced by one tab is harmless to the other (it just fetches a smaller next window).

---

## 9. Summary checklist

- [ ] One singleton socket per tab, `transports: ['websocket']`, handshake token from `/api/auth/socket-token`.
- [ ] Query cache = truth for threads/messages/contacts/calls; Zustand = typing/presence/active-call/drafts/connection.
- [ ] Register `create`/`update`/`delete` once; branch on payload shape (`headerId+messageId` = message, `lastMessage` no `headerId` = thread).
- [ ] Register a listener **keyed by room name** for join acks/room broadcasts (dynamic-event-name quirk).
- [ ] Optimistic send with `refId` UUID; reconcile REST response and socket echo by `refId`; reuse `refId` on retry.
- [ ] Edit/delete/react reconcile by `messageId`/`headerId`; tombstone deletes, don't remove.
- [ ] On connect / visibility-foreground / online: re-join rooms, run threads → messages → calls sync, drain `hasMore`, advance cursors after merge.
- [ ] Respect symmetric-privacy presence and the first/last-socket presence rule across tabs.
