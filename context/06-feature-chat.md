# 06 — Chat Feature Spec (DM + Group)

> Purpose: the web implementation contract for unsendnext chat — sending (optimistic + refId reconcile), receiving over socket, typing, presence, receipts, reactions, @mentions, edit, delete, forward, voice messages, pagination, and delta-sync. Backend is consumed as-is.

All REST paths below are relative to the global prefix `/api/v1` (see `02-backend-rest-api.md`). All socket event names and quirks cross-link `03-websocket-events.md`. DTO/entity field shapes cross-link `05-data-models.md`.

Sources read for this spec: `backend/src/messages/messages.controller.ts`, `backend/src/messages/chat.controller.ts`, `backend/src/messages/dtos/*`, `backend/src/sockets/sockets.gateway.ts`, `backend/src/types/{message,mention,reaction,messageInfo,deliveredReadEvent,socketEvent}.ts`, and the RN portable layer `frontend/src/Services/message.ts`, `frontend/src/Hooks/Socket/*`, `frontend/src/Contexts/Socket/SocketContext.tsx`, `frontend/src/Constants/api.ts`.

---

## 1. Core data model recap

A **conversation** is identified by a `topicId`. Each participant owns a **separate per-user Thread document** (own `threadId` / `_id`) that all share that `topicId` (quirk #4 — see `05-data-models.md`). A **chat** record (one per topicId) holds `participants`, `chatName`, `chatIcon`, `messageCounts`, `createdBy`, and the `isGroup`/`isChat`/`isEmail` flags. The same `messages` collection backs chat, group, and email — chat messages are just rows with `isChat: true` and `isEmail: false`.

Message wire shape (from `backend/src/types/message.ts`, via `messageFactory`). Note `messageId === _id`:

| Field | Notes |
|---|---|
| `messageId` / `_id` | server id (string). `messageFactory` sets `messageId = _id`. |
| `refId` | client-supplied UUID v4 (idempotency key). May be `null`. |
| `threadId` | the recipient's per-user thread id. |
| `headerId` | stable id shared across the per-user copies of one logical message. **Reactions/delete-for-me/remove-reaction key on `headerId`, not `messageId`.** |
| `from`, `to`, `cc`, `bcc` | `IContact` = `{ name, address, phone? }`. |
| `text`, `html`, `hasHtml` | chat uses `text`; `html` is for email. `getThreadMessages`/`getOlderMessages`/mentions `.select('-html')` (HTML omitted — fetch via `GET /messages/message/:id`). |
| `seen`, `edited`, `forwarded`, `isDeleted`, `isCall`, `isEvent`, `isInfoMessage`, `isPromotional` | booleans. |
| `isRead`, `isDelivered` | recipient-perspective receipt flags. |
| `reactions[]` | `IReaction` = `{ id, reaction, byUser: { userId, name, username }, createdAt }`. |
| `attachments[]` | `AttachmentDto` = `{ id, url, title, thumbnail, type, size, placeholder? }`. |
| `mentions[]` | `IMention` (see §9). |
| `readInfo[]`, `deliveryInfo[]`, `voiceListenedInfo[]` | `IMessageInfo` = `{ userId, name, username, createdAt }` — per-user receipt rosters (drive group "seen by"). |
| `replyTo` | `headerId` of the replied-to message (nullable). |
| `createdAt`, `updatedAt` | timestamps. |

> Caveat: OpenAPI types many of these payloads as `object` / `any` (e.g. `SendMessageResponseDto.message` is annotated `string` but is actually the message object; `FetchOlderMessagesDto.data` is `any`). Treat the OpenAPI-generated types as loose and confirm field access against `messageFactory` in `backend/src/types/message.ts`.

---

## 2. Room model & how the web client receives everything

The gateway is websocket-only and authenticates at handshake (token in `handshake.auth`; see `03-websocket-events.md` and `04-auth-sessions-deviceid.md`). On connect (`sockets.gateway.ts handleConnection`) the server auto-joins the socket to **two rooms**: its own `socket.id`, and a **stable room keyed by the authenticated `userId`**. Message/thread/receipt fan-out is emitted into the **recipient's userId room** (see `compose.service.createSocketsData`, where `room: key` is the recipient userId). 

**Implication for web:** you do NOT need to manually join a room to receive new messages / receipts / reactions for your conversations — they arrive in your userId room automatically. The `create` / `update` / `delete` events (`SocketEvent` enum in `backend/src/types/socketEvent.ts`) carry both message rows and thread rows.

`join`/`leave` (quirk #1) are still relevant for **typing fan-out targeting and the room-name echo**. When a client emits `join` with a room name, the server replies by emitting an event **whose name equals the room name** (`io.in(room).emit(room, { name, eventType: 'Joined' })`). If you join rooms, register a listener keyed by the exact room string you joined. The RN layer joins `threadId` and `topicId` per open conversation (`frontend/src/Hooks/Socket/useRoomManagement.tsx`) and skips ids containing `NOT-SEND` (temporary/local-only).

### Event ↔ payload disambiguation (critical)

`create` and `update` are **overloaded**: the server emits the SAME event name for both a new **message** and the new/updated **thread** row. The RN handlers branch on payload shape (`frontend/src/Hooks/Socket/useMessageUpdates.tsx` / `useThreadUpdates.tsx`):

- **Message event** ⇔ `data.headerId && data.messageId` present.
- **Thread event** ⇔ `data.lastMessage` present and `data.headerId` absent.

unsendnext must replicate this branch before routing a `create`/`update` into the TanStack Query message cache vs. the thread-list cache.

### Socket emit/on surface (web client side)

From `frontend/src/Contexts/Socket/SocketContext.tsx`: `joinRoom(roomId)` → `emit('join', roomId)`, `leaveRoom(roomId)` → `emit('leave', roomId)`, plus generic `emit(event, data)` / `on(event, cb)`. The socket id is also sent as the `socketId` (a.k.a. `x-socket-id`) HTTP header on REST calls so the server can exclude the originating socket from echo (see §3).

---

## 3. Sending a message (optimistic + refId reconcile)

**Endpoint:** `POST /messages` (`messages.controller.sendMessage`). Body = `SendMessageDto` (`backend/src/messages/dtos/sendMessage.dto.ts`). Send the `socketId`/`x-socket-id` header so the server suppresses the echo `create` back to this tab.

Minimal chat send body:

```jsonc
{
  "refId": "<uuid-v4>",                 // client-generated, REQUIRED for idempotency
  "topicId": "<existing topicId|null>", // null/omit when composing a brand-new DM/group
  "toList": [{ "name": "Omar", "address": "omar@unsend.app" }], // ArrayMinSize(1)
  "ccList": [],
  "bccList": [],
  "text": "hello",
  "isChat": true,
  "isGroup": false,                     // true for group
  "isEmail": false,
  "mentions": [ /* see §9 */ ],
  "attachments": [ /* AttachmentDto[] */ ],
  "withUrlPreview": false
}
```

Routing logic in the controller:
- With `topicId` → posts into that existing conversation (`chatService.getChatByTopic`).
- No `topicId`, `!isGroup && !isEmail` → server tries to match an existing DM by participant set (`getChatByRecipientsUserAddresses`). If found it reuses it.
- No chat found → server creates a chat with a fresh `topicId` (group when `isGroup` or `participants.length > 2`).
- Sender-not-participant → returns `{ failedToSend: true, message }` (HTTP 201, not an error). Web must check this flag.

**Response** = `SendMessageResponseDto`: `{ topicId, threadId, message }` where `message` is the persisted message object (incl. `messageId`, `refId`, `headerId`). The web RN service wrapper is `frontend/src/Services/message.ts → sendMessage` (it also rewrites `\n` → `<br />` in `text` and forces `withUrlPreview: boolean`).

### Idempotency (quirk #3)

The server is idempotent on `(userId + refId)` (`compose.service.ts` lines ~140–182). A `POST` whose `refId` already corresponds to a persisted message returns the **existing** message tagged `isIdempotentReplay: true`, and the controller **skips the `messageCounts` increment** on replay. So a retried send never duplicates.

### Optimistic + reconcile recipe (web)

1. Generate `refId = crypto.randomUUID()`.
2. Insert an optimistic message into the thread's TanStack Query cache, keyed by `refId`, status `sending`. Render immediately.
3. `POST /messages` with that `refId` and the `socketId` header.
4. On success: replace the optimistic row by matching `response.message.refId === refId`; adopt the server `messageId`/`headerId`/`createdAt`; mark `sent`.
5. On the inbound socket `create` for the same message (own echo is normally suppressed via `socketId`, but a second tab/device will receive it): de-dupe by `refId` first, then by `messageId`. The RN layer additionally guards against rapid duplicates with a short "recently processed" TTL — replicate a small (e.g. ~2s) de-dupe window per `messageId`.
6. On network failure: keep the row `failed` and retry with the **same `refId`** (idempotency makes this safe).

> `refId` is the join key between optimistic UI and both the REST response and the socket echo. Always set it.

---

## 4. Receiving a message over socket

Listen on the userId room (auto-joined) for `create` (new message) and `update` (mutated message). Branch on `data.headerId && data.messageId` (§2) to confirm it's a message event, then upsert into the thread's message cache keyed by `messageId`, applying last-writer-wins on `updatedAt` (RN: `isNewer(incoming.updatedAt, existing.updatedAt)`). Also handle the parallel thread event (`data.lastMessage`) to update the conversation list (last message preview, ordering, unread). A `delete` message event carries `messageId`; mark that message `isDeleted` (see §10).

---

## 5. Typing indicators

Client → server: `emit('typing', { channel: <topicId>, event: 'typing' | 'stop-typing' })` (`frontend/src/Hooks/Socket/useTypingIndicator.tsx`). The gateway resolves all per-user threads for that `topicId`, then emits the given `event` name (`'typing'` or `'stop-typing'`) into every **other** participant's userId room.

Server → client payload (`sockets.gateway.handleTyping`):

```jsonc
{ "name": "Jane Doe", "userId": "<senderUserId>", "event": "typing", "channel": "<topicId>", "createdAt": "<iso>" }
```

Web: keep typing state ephemeral in Zustand keyed by `channel` (topicId) + `userId`. Debounce outbound `typing`, send `stop-typing` on idle (e.g. ~3s) and on send. Auto-expire stale typing entries (the server does not guarantee a `stop-typing`).

---

## 6. Presence (symmetric privacy — quirk #2)

Presence is opt-in and **symmetric**: a user with `showOnlineStatus === false` neither broadcasts nor receives presence (`sockets.gateway.ts`).

| Direction | Event | Payload |
|---|---|---|
| Client → server | `presence:subscribe` | `{ usernames: string[] }` → server joins `presence:<userId>` rooms; returns `{ ok, count }`. If requester opted out → no-op `{ ok: true, count: 0 }`. Targets that opted out are skipped. |
| Client → server | `presence:unsubscribe` | `{ usernames: string[] }` |
| Server → client | `presence:online` | `{ userId, username }` (emitted only on the user's first socket). |
| Server → client | `presence:offline` | `{ userId, username, lastSeenAt? }` (`lastSeenAt` present only if `showLastSeen !== false`; emitted only when the user's last socket disconnects). |

Web: after the conversation list loads, `presence:subscribe` with the visible participants' usernames; render online dots and "last seen". Store presence in Zustand (ephemeral). See `03-websocket-events.md` for the full presence section.

---

## 7. Delivered / read receipts

Two channels exist: socket acks (preferred, low-latency) and REST fallbacks. Receipt mutations re-emit an `update` for the affected message(s) into participant userId rooms, **excluding** the acking socket (the gateway tags `client['user'].socketId = client.id`). The receipt enum is `DeliveredReadEvent` (`backend/src/types/deliveredReadEvent.ts`): `READ='read'`, `DELIVERED='delivered'`, `VOICE_LISTENED='voiceListened'`.

### Preferred: socket acks (`sockets.gateway.ts`)

| Emit | Payload | Effect |
|---|---|---|
| `ack:delivered` | `{ messageIds: string[] }` | bulk mark delivered (`setBulkMessagesDelivered`); returns `{ ok, count }`. |
| `ack:read` | `{ threadId: string }` | mark the whole thread seen+delivered (`setThreadMessagesSeenAndDelivered`); returns `{ ok: true }`. |
| `message` | `{ messageId, event: 'read' \| 'delivered' }` | per-message set; routed via the `seen-delivered` internal event. |

### REST fallbacks (`messages.controller.ts`, send the `socketId` header)

| Method & path | Body / param | Purpose |
|---|---|---|
| `PATCH /messages/delivered/:messageId` | param | mark one message delivered. |
| `PATCH /messages/delivered` | `BulkDeliveredDto { messageIds: string[] }` | bulk delivered. |
| `PATCH /messages/thread/:id/seen` | param `id`=threadId | mark a thread's messages seen + delivered. |
| `PATCH /messages/threads/bulk-seen` | `BulkThreadsSeenDto { threadIds: string[] }` | bulk seen across threads. |

RN service wrappers: `setMessageAsDelivered`, `setMessagesAsDelivered`, `setThreadMessagesSeen`, `bulkSetThreadsMessagesSeen` (`frontend/src/Services/message.ts`).

**Web recommendation:** when the socket is connected, use `ack:delivered` on receipt and `ack:read` when the conversation is focused/visible; fall back to the REST endpoints when offline-then-reconnected or for catch-up. On the inbound `update`, refresh `seen` / `isRead` / `isDelivered` and the `readInfo`/`deliveryInfo` rosters (group "seen by"). Receipts are governed only by the receipt flags, independent of presence privacy.

---

## 8. Reactions (add / remove)

Reactions are keyed by `headerId` for removal. One reaction per user per message (re-reacting **replaces** the user's prior reaction — see controller `reactToMessage`). Reacting to an `isDeleted` message → 404 "Message is Unsent!".

| Action | Method & path | Notes |
|---|---|---|
| Add / change | `POST /messages/message/:id/reaction/:reaction` | `:id` = messageId, `:reaction` = emoji/string. Returns the updated message (`messageFactory`). |
| Remove | `DELETE /messages/header/:id/reaction/:reactionId` | `:id` = **headerId**, `:reactionId` = the `IReaction.id`. Returns `{ success, message }`. |
| List | `GET /messages/message/:id/reactions` | returns `reactions[]` (`ReactionsResponseDto[]`). |

RN wrappers: `reactToAMessage`, `removeReaction`, `getReactionsToAMessage`. The server pushes a reaction update over the socket (`composerService.sendReactionsUpdate` + an `update` message event), so other tabs/participants reconcile via the inbound `update` (§4). Web: optimistically toggle in cache, send the `socketId` header to avoid self-echo.

---

## 9. @mentions + Mentions inbox

**Outbound:** include a `mentions: MentionDto[]` array on `POST /messages` (`backend/src/messages/dtos/mention.dto.ts`):

```jsonc
{ "userId": "<id|null>", "handle": "john", "offset": 6, "length": 5, "type": "user" | "everyone" }
```

Server-side validation (in `mention.helpers.ts`, beyond class-validator):
- `userId` required iff `type === 'user'`; omitted for `everyone`.
- `userId`, when present, must be a participant of the target chat.
- `offset` + `length` must lie inside `text`, and the substring at `[offset, offset+length)` must start with `@`.

The literal `@handle` stays in `text` at that span; the structured array is what the client uses for chip rendering (keyed on `userId` so chips survive renames). Malformed entries are rejected.

**Mentions inbox:** `GET /messages/mentions?limit=<n>&before=<ISO>` (`getMentionsInbox`). Returns messages where the caller is targeted by a `type: 'user'` mention (`mentions.userId === me`), newest first, HTML stripped. Cursor with `before=<ISO createdAt>` for older pages. `limit` clamps to 1..200 (default 50). Web: a dedicated "Mentions" view; refresh on inbound `create`/`update` that mentions the user.

---

## 10. Edit, delete (for-me vs global)

| Action | Method & path | Body | Notes |
|---|---|---|---|
| Edit | `PATCH /messages/message/:id` | `EditMessageDto { text: string }` (non-empty) | `:id` = messageId. Sets `edited: true`, emits `update`. Returns `{ success, message: 'updated for all' }`. Edit is global (for everyone). |
| Delete for me | `DELETE /messages/forMe` | `DeleteMessagesForMeDto { headerIds: string[] }` (min 1) | keyed by **headerId**; hides only the caller's copy. |
| Delete for all | `DELETE /messages/message/:id` | — | `:id` = messageId. Soft-deletes globally (`isDeleted: true`), emits `delete`/`update`; other clients mark `isDeleted` and render an "unsent" placeholder. |

RN wrappers: `editMessage`, `deleteMessageForMe`, `deleteMessageForAll`. Send the `socketId` header on all three. Web: optimistically apply, reconcile from the inbound socket event. A deleted message can't be reacted to (§8). In delta-sync, global deletes surface as `deletedMessageIds` (§13), not as rows.

---

## 11. Forward

**Endpoint:** `POST /messages/forward` (`messages.controller.forwardMessage`). Body = `ForwardMessagesDto`:

```jsonc
{
  "messagesIds": ["<id>", "..."],     // ArrayMinSize(1), forwarded in createdAt order
  "topicId": "<existing|null>",        // omit to compose a new conversation
  "toList": [{ "name": "...", "address": "..." }], // ArrayMinSize(1)
  "ccList": [], "bccList": [],
  "isChat": true, "isGroup": false, "isEmail": false,
  "subject": "Fwd: ...",
  "text": "optional forwarding note",  // sent as a trailing reply message
  "attachments": [],
  "withUrlPreview": false
}
```

Behavior: each source message is re-sent into the target conversation (creating it if absent); if `text`/`attachments` are present, an extra "forward reply" message is appended. `messageCounts` is incremented by the count of forwarded messages (+1 when a reply note exists). **Returns the target Thread object** (`threadFactory`), HTTP 201 — not a plain message. RN wrapper: `forwardMessages` (`Promise<Thread>`). Web: after forwarding, navigate to / refresh the returned thread.

---

## 12. Voice messages (+ voice-listened)

Voice notes are ordinary messages whose `attachments[]` carry the audio (`AttachmentDto`; `type` distinguishes audio, `placeholder` may hold a waveform/peaks hint). Upload via the signed-URL flow: `GET /messages/attachment/:filename` → `{ url, filename }` (PUT the blob to `url`, then send the message referencing `filename`). RN wrapper: `getSignedURLForUploadAttachment`.

**Mark listened:** `PATCH /messages/voice-listened/:messageId` (`setVoiceListened`). Appends the listener to `voiceListenedInfo[]` (`IMessageInfo`) and emits an `update` message event (`DeliveredReadEvent.VOICE_LISTENED`). It is recorded once per user (duplicate calls are ignored server-side). Send the `socketId` header. Web: call this when the user actually plays the clip to completion (or starts playback — match mobile UX); render a "played" indicator from `voiceListenedInfo`. No dedicated RN service wrapper exists yet for this endpoint — call `PATCH /messages/voice-listened/:messageId` directly.

---

## 13. Pagination & back-scroll

| Method & path | Shape | Use |
|---|---|---|
| `GET /messages/thread/:id/before/:cursor/size/:size` | `FetchOlderMessagesDto { data: Message[], hasMore }` | **Preferred** cursor back-scroll. `:cursor = 'head'` → newest `size` (initial open + polling). `:cursor = <messageId>` → up to `size` messages strictly older than that message, newest first. Unknown id → `{ data: [], hasMore: false }`. No `countDocuments`/`skip`; stable mid-scroll. |
| `GET /messages/thread/:id/page/:page/size/:size` | `FetchThreadMessages` (paged `{ data, totalCount, currentPage, totalPages }`) | **Deprecated** offset pagination. Avoid in unsendnext — exists only for parity reference. RN wrapper `fetchThreadMessages` still uses it. |
| `POST /messages/bulk-fetch` | `BulkFetchMessagesRequestDto { threadIds: string[], limit:1..100 }` → `{ messages: Record<threadId, Message[]>, totalMessages, threadsCount }` | initial-load fan-in to avoid N+1 across many threads. |
| `GET /messages/message/:id` | `{ _id, html }` | fetch full HTML body (list endpoints `.select('-html')`). RN wrapper `getMessageHtml`. |

**Web back-scroll recipe:** initial open → `:cursor='head'`. To load older, pass the **oldest currently-cached `messageId`** as `:cursor`; stop when `hasMore === false`. Render with `@tanstack/react-virtual`. Newest-first results — reverse for top-to-bottom display. Use TanStack Query `useInfiniteQuery` with the messageId cursor as the page param.

---

## 14. Delta-sync (catch-up after offline)

**Endpoint:** `GET /messages/sync/:lastSyncTime` (`syncMessages`). `:lastSyncTime` must be an ISO-8601 timestamp (invalid → 400). Returns:

```jsonc
{
  "messages": [ /* created+updated rows since lastSyncTime (incl. receipts/edits/reactions) */ ],
  "deletedMessageIds": [ "<refId>", "..." ],   // soft-deleted since cursor (refId preferred)
  "syncTime": "<ISO>",                          // cursor for the NEXT call
  "hasMore": true,                              // page cap 500
  "updatedCount": 0, "deletedCount": 0
}
```

Web: persist `lastSyncTime` (cursor) in `localStorage`. On reconnect/app-focus, call repeatedly — feed each response into the message caches, remove `deletedMessageIds`, advance the cursor to `syncTime`, and **loop while `hasMore === true`** (each page ≤ 500). This is the authoritative reconciliation path that backfills anything missed while the socket was down. Note `deletedMessageIds` carries `refId`s (per `SyncMessagesResponseDto`); match deletions by `refId`, falling back to `messageId` if needed.

> Caveat: `SyncMessagesResponseDto.messages` is typed `any[]` in OpenAPI; rows follow the §1 message shape but may include only changed fields. Confirm against RN sync handling and `messageFactory`.

---

## 15. Group / chat administration

`chat.controller.ts` (base `chat`):

| Method & path | Body | Purpose |
|---|---|---|
| `PUT /chat/:topicId` | `UpdateSingleThreadDto` (name etc.) | update chat info (group name, icon). |
| `PUT /chat/:topicId/participants` | `UpdateParticipantsDto { participants: string[] }` (full email list) | add/remove participants (send the **complete** desired list). |
| `PUT /chat/:topicId/leave` | — | leave a group. |

RN wrappers: `updateChatInfo`, `updateChatParticipants`, `leaveGroup` (`frontend/src/Services/message.ts` + `frontend/src/Constants/api.ts`). All send the `socketId` header. Participant/group changes generate info/system messages and thread `update` events that arrive over the socket; reconcile the conversation list and the in-thread system message accordingly.

Adjacent helpers on `messages.controller.ts`: `POST /messages/chat/user` (`getOldChatThread` — resolve `{ topicId, threadId, isGroup }` from participants), `GET /messages/userChats` (popular/recent), `GET /messages/chat/search?qry=&page=&size=` (search chats).

---

## 16. Web implementation checklist

- [ ] Every send sets a client `refId` (UUID v4); optimistic row keyed by `refId`; reconcile via REST response then de-dupe socket echo by `refId` → `messageId`.
- [ ] Send the `socketId` (`x-socket-id`) header on all mutating REST calls to suppress self-echo.
- [ ] Branch `create`/`update` socket payloads: message (`headerId && messageId`) vs thread (`lastMessage`).
- [ ] Receipts via `ack:delivered` / `ack:read` when connected; REST fallbacks otherwise; render `readInfo`/`deliveryInfo` for group "seen by".
- [ ] Reactions remove via `headerId` + reaction id; add/change via messageId.
- [ ] Mentions: structured `mentions[]` on send (offset/length over `text`); Mentions inbox via `GET /messages/mentions`.
- [ ] Delete-for-me uses `headerIds`; delete-for-all uses messageId and renders "unsent".
- [ ] Forward returns a Thread, not a message.
- [ ] Voice "played" via `PATCH /messages/voice-listened/:messageId`.
- [ ] Back-scroll via `/before/:cursor` with `head` then oldest cached messageId; stop on `hasMore=false`; virtualize.
- [ ] Delta-sync loop on reconnect: drain `hasMore`, advance `syncTime`, apply `deletedMessageIds`.
- [ ] Presence subscribe only for visible participants; honor symmetric-privacy (web simply consumes what the server sends).

> Out of scope (quirk #5): web has no VoIP/background push, so incoming calls only ring while a tab is open. See `08-feature-calls.md`.
