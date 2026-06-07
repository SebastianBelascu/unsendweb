# 05 — Data Models

> Purpose: define the backend's MongoDB entities and the conceptual data model the **unsendnext** web client must internalize (conversations = topicId; per-user Thread docs; rich Message shape; refId idempotency; dual-DB layout), grounded in `backend/src/entities/*.schema.ts`.

This file is the source-of-truth glossary for server entities. Endpoint and socket-event inventories live in the feature docs (chat, email, threads, calls, presence); cross-links are at the bottom. The TanStack Query cache is the client's source of truth for these entities (see the realtime/state docs); this file describes what those cache entries _are_.

---

## 1. The conceptual model (read this first)

The single most important idea: **a conversation is identified by `topicId`, but it does NOT exist as one shared document.** Each participant owns their own per-user `Thread` document. All of a conversation's per-user Thread docs share the same `topicId`.

```
                 topicId = "abc"  (the conversation)
        ┌────────────────────┼────────────────────┐
   Thread(userA)        Thread(userB)        Thread(userC)
   _id, userId=A        _id, userId=B        _id, userId=C
   isPinned, isSpam…    isPinned, isSpam…    isPinned, isSpam…
   lastMessage          lastMessage          lastMessage
        └──────── all share topicId="abc" ─────────┘

                 Chat(topicId="abc")   ← ONE shared doc
                 participants:[A,B,C], chatName, chatIcon, createdBy
```

Consequences for the web client:

- A user's inbox list is **their own `Thread` docs** (`userId == me`), not `Chat` docs. Per-user flags (`isPinned`, `isSpam`, `isBookmarked`, `isSilent`, `isDeleted`, `subject`, `lastMessage`) are stored on each participant's own Thread, so "pin / mark spam / delete" only affects the actor's view.
- The shared, conversation-level facts (full participant roster, `chatName`, `chatIcon`, `createdBy`, type flags) live on the single `Chat` doc keyed by `topicId`.
- `Message` docs are also **fanned out per user**: one send creates one Message document per participant (each with `userId` = that recipient), all sharing the client-supplied `refId`. See §3 (idempotency) and the chat feature doc.
- `topicId` is the join key that ties Thread ↔ Chat ↔ Call ↔ Message-stream together. Always group/scope client state by `topicId`.

`_id` strings: most app-DB entities use a custom string id from `createId` (NOT a raw Mongo ObjectId). Notable exception: `Thread.userId` is a real `Types.ObjectId` ref to `User` (User `_id` is itself a string — confirm serialization against RN `Services/` when comparing ids; mixed id types here are a known sharp edge).

---

## 2. Dual MongoDB layout

The backend connects to **two databases** (`backend/src/app.module.ts`):

| Connection name | DB name | Env var | Role |
|---|---|---|---|
| `fb` | `followback` | `DB_URL` | The app DB. All entities documented below (User, Thread, Message, Chat, Call, Device, Contact, etc.) live here. |
| `wildduck` | `wildduck` | `WD_DB_URL` | The email backend (WildDuck IMAP/SMTP server's own store): raw email messages, mailboxes, attachments. |

- The `User.wildduck_id` field links an app user to their WildDuck account. Email send/receive (`backend/src/email/*`, `backend/src/wildduck/*`) reads/writes the `wildduck` DB; `WildduckService` registers `Thread`/`Message`/`Mailbox` models on the `wildduck` connection too, but **the canonical Thread/Message docs the web client consumes are the `fb` copies** surfaced by the REST/socket API.
- **Web client impact: none directly.** The web app never talks to WildDuck. It consumes normalized Thread/Message JSON over REST + WebSocket. The split matters only to explain why an email Thread (`isEmail: true`) has fields (`headerId`, `msgid`, `uid`, `metadata`, `originalSubject`) that chat threads leave empty/default. Email-specific behavior is covered in the email feature doc.

---

## 3. `refId` idempotency (client contract)

`Message` has a compound **unique** index on `{ userId, refId }`, scoped by `partialFilterExpression: { refId: { $type: 'string' } }` (`backend/src/entities/message.schema.ts`).

- The **client supplies `refId`** (a UUID) when sending. Retrying the same send with the same `refId` will not create a duplicate for that sender — the DB enforces it.
- `refId` alone is NOT unique: the per-recipient fan-out creates several Message docs sharing one `refId`, distinguished by differing `userId`. Uniqueness is per `(userId, refId)`.
- Legacy rows have `refId == null` and are excluded from the constraint (partial index).
- Web client rule: generate one `refId` per logical send (e.g. `crypto.randomUUID()`), reuse it on retries, and use it as the optimistic-update / dedup key in the Query cache. See the chat feature doc for the send flow.

---

## 4. Entity reference

Types are the Mongoose/`@Prop` types from the schema files. "Notable" lists defaults, indexes, uniqueness, immutability, and refs. Embedded subdocument shapes are in §5.

### 4.1 `User` — `entities/user.schema.ts` (DB: `fb`)

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` default |
| `firstName`, `lastName` | string | |
| `username` | string | unique, lowercase, indexed |
| `usernameCanonical` | string? | unique, **sparse**, indexed (dots stripped for uniqueness) |
| `phone` | string | unique, indexed |
| `password` | string | never sent to client |
| `gender` | string | |
| `birthDate` | Date | |
| `active`, `verified`, `blocked` | boolean | |
| `role` | enum `UserRole` (`admin`/`user`) | default `user` |
| `loginAttempts`, `otpRetries` | number | auth throttling |
| `otpBlockExpirationDate`, `lastLogin` | Date | |
| `wildduck_id` | string | default `null`; links to `wildduck` DB account |
| `spamSenderAddresses` | string[] | default `[]` |
| `invitationCode` | string (ref `InvitationCode`) | **required** |
| `avatarVersion` | number | default `0`; bump to bust avatar cache |
| `avatarUpdatedAt` | Date | default now |
| `lastSeenAt` | Date? | written on last socket disconnect; missing ⇒ "unknown" |
| `showOnlineStatus` | boolean | default `true`; **symmetric** — false ⇒ user neither broadcasts nor receives presence |
| `showLastSeen` | boolean | default `true` |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

Presence/last-seen are privacy-gated symmetrically — see the presence feature doc. The OpenAPI/REST profile shape is a subset of this; treat `password`/`otp*`/`loginAttempts` as server-only.

### 4.2 `Thread` — `entities/thread.schema.ts` (DB: `fb`)

The **per-user** conversation view. One doc per `(userId, topicId)`.

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `topicId` | string | **required, indexed** — conversation key |
| `userId` | ObjectId (ref `User`) | **required, indexed** — the owner of this view |
| `subject` | string | default `''` (email subject) |
| `isSpam` | boolean | indexed; per-user |
| `isPromotional` | boolean | indexed |
| `isBookmarked` | boolean | indexed |
| `isPinned` | boolean | indexed |
| `pinDate` | Date | default `null` |
| `isSilent` | boolean | muted (no notifications) |
| `isDeleted` | boolean | indexed; per-user soft delete |
| `isEmail` | boolean | **immutable**; type discriminator |
| `isForwardedEmail` | boolean | |
| `isGroup` | boolean | **immutable** |
| `isChat` | boolean | **immutable** |
| `favicon` | string | default `null`; email sender favicon URL |
| `lastMessage` | string (ref `Message`) → embedded Message | default `null`; denormalized for inbox preview |
| `threadRef` | string | default `null`, indexed |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

Type flags `isEmail`/`isGroup`/`isChat` are immutable after creation. Compound indexes optimize inbox listing (`userId+updatedAt`), filtered views (spam/deleted, pinned, bookmarked), and **delta sync** (`userId+updatedAt+isDeleted`). The client's inbox is a sorted list of these docs; sorting in the RN client uses a computed `sortedDate` (pinDate if pinned else max(createdAt, lastMessage.createdAt)) — see RN `frontend/src/Types/threads/index.ts`. The REST list response may also fold in `Chat` attributes (`participants`, `chatName`, `chatIcon`, `messageCounts`, `createdBy`); confirm exact merged shape against the threads feature doc and RN `Services/`.

### 4.3 `Message` — `entities/message.schema.ts` (DB: `fb`)

Per-user message doc (fanned out per recipient). Rich enough to carry both chat and email semantics.

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `refId` | string | default `null`, indexed; client-supplied UUID. Unique with `userId` (see §3) |
| `threadId` | string (ref `Thread`) | **required, indexed** |
| `headerId` | string | **required, indexed**; shared per conversation message (email Message-ID / chat header) |
| `userId` | string (ref `User`) | **required, indexed**; whose copy this is |
| `uid` | string | default `null`; WildDuck IMAP uid (email) |
| `msgid` | string | default `null`, indexed; email message-id |
| `from` | `contact` | required |
| `to` | `contact[]` | required |
| `cc`, `bcc` | `contact[]` | default `[]` |
| `html` | string | default `null`; sanitize before render (DOMPurify + sandboxed iframe) |
| `hasHtml` | boolean | auto-computed by pre-save/pre-update hook from `html` |
| `text` | string | default `''`; plain text (mention spans live here) |
| `seen` | boolean | **per-user** "I have seen it" (distinct from `isRead`) |
| `edited` | boolean | |
| `forwarded` | boolean | |
| `forwardedFrom` | `contact` | default `null` |
| `originalSubject` | string | default `null` (email) |
| `isPrivate` | boolean | |
| `isSpam` | boolean | |
| `isDeleted` | boolean | soft delete |
| `isEvent` | boolean | |
| `isHidden` | boolean | |
| `outbound` | boolean | **true ⇒ sent by this user** (the key "is this mine?" flag for bubble alignment) |
| `isPromotional` | boolean | |
| `isRead` | boolean | message-level: read by **all** participants (distinct from per-user `seen`) |
| `isDelivered` | boolean | delivered to all |
| `isCall` | boolean | this message represents a call event (renders as call log entry) |
| `isInfoMessage` | boolean | system/info message (e.g. "X joined") |
| `withUrlPreview` | boolean | sender opted into link preview |
| `replyTo` | string | default `null`; id of replied-to message |
| `reactions` | `IReaction[]` | default `[]` |
| `attachments` | `IAttachment[]` | default `[]` |
| `readInfo` | `IMessageInfo[]` | default `[]`; who read it + when (read receipts) |
| `deliveryInfo` | `IMessageInfo[]` | default `[]`; who received it + when |
| `voiceListenedInfo` | `IMessageInfo[]` | default `[]`; who listened to a voice note |
| `metadata` | `MetaData` (from/to/cc/date) | email envelope metadata |
| `mentions` | `IMention[]` | default `[]`; indexed sparse on `mentions.userId` for mentions inbox |
| `addedParticipants` | `contact[]` | email-only |
| `removedParticipants` | `contact[]` | email-only |
| `isForwardReply` | boolean | email-only |
| `isAutoReply` | boolean | email-only |
| `isBeforeAdded` | boolean | email-only (sent before user joined thread) |
| `processedAt` | Date | when incoming email was saved |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

Key client distinctions:
- `seen` (per-user) vs `isRead` (all participants) vs `readInfo[]` (granular receipts). For group read state, use `readInfo`/`deliveryInfo`.
- `outbound` is the canonical "this is my message" flag for alignment/ownership UI.
- `html`/`text`/`hasHtml`: render `html` only after sanitizing; fall back to `text`. `hasHtml` is server-maintained, don't compute it client-side as truth.
- Delta sync uses `{userId, updatedAt}` ascending (`GET .../messages/sync/:lastSyncTime`) — see the threads/sync feature doc.
- RN client field-name drift: RN `frontend/src/Types/message/index.ts` exposes `messageId` (maps to `_id`) plus client-only fields (`failedToSend`, `isInProgress`, `isDraft`, `reactionText`) that are NOT on the backend schema. The OpenAPI client may type some embedded arrays loosely (`any`/`object`); confirm against RN `Services/` when the spec is vague.

### 4.4 `Chat` — `entities/chat.schema.ts` (DB: `fb`)

The **one shared** conversation-level doc.

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `participants` | string[] | **required**; **unique compound index** on `participants` |
| `topicId` | string | **required, unique, indexed** |
| `chatName` | string | default `''`, indexed |
| `chatIcon` | string | default `''`, indexed |
| `messageCounts` | number | default `1` |
| `isEmail` | boolean | **immutable** |
| `isGroup` | boolean | **immutable** |
| `isChat` | boolean | **immutable** |
| `createdBy` | string | **required, indexed** |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

Schema-enforced invariants (pre-validate / pre-update hooks): type flags are immutable; a 1:1 chat (`isChat && !isGroup`) **cannot exceed 2 participants**; `participants` is globally unique (one chat per exact participant set). The web client should treat `Chat` as the roster/metadata source and `Thread` as the per-user state.

### 4.5 `Call` — `entities/call.schema.ts` (DB: `fb`)

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `uuid` | string | **required, unique**; call identity |
| `topicId` | string (ref `Chat`) | **required** |
| `channelName` | string | **required, indexed**; Agora channel |
| `type` | enum `CallType` (`voice`/`video`) | default `voice` |
| `callerId` | string (ref `User`) | **required, indexed** |
| `isGroup` | boolean | default false |
| `subject` | string? | default `null` |
| `status` | enum `CallStatus` (`active`/`started`/`missed`/`declined`/`ended`/`failed`) | **required** |
| `participants` | `CallParticipant[]` | **required**; indexed on `participants.userId` |
| `startedAt` | Date | default now |
| `receivedAt` | Date? | when receiver reported the incoming call |
| `duration` | number | seconds |
| `messageId` | string? | the `isCall` info-Message tied to this call |

`CallParticipant` embedded: `userId` (ref User, req), `username` (req), `name` (req), `address` (req), `uid?` (Agora client uid), `isOnHold?`, `isMuted?`, `isVideoOn?`. `channelName` + an Agora token (issued by a calls endpoint) drive `agora-rtc-sdk-ng`. On web, incoming calls only ring while a tab is open (no VoIP/background push — out of scope). See the calls feature doc.

### 4.6 `Device` — `entities/device.schema.ts` (DB: `fb`)

Push-notification device registry. **Largely irrelevant to web** (no service-worker push in scope), but documented for completeness.

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `userId` | string (ref `User`) | required, indexed |
| `deviceId` | string | required, indexed |
| `deviceToken` | string | required |
| `voipToken` | string | iOS VoIP push |
| `badge` | number | default 0 |
| `deviceName`/`deviceType`/`deviceOs`/`deviceOsVersion`/`deviceAppVersion` | string | |
| `pushPlatform` | enum `apns`/`fcm`? | routing discriminator; missing ⇒ heuristic |
| `createdAt`, `lastActiveAt` | Date | both indexed |

No Mongoose `timestamps` here — `createdAt`/`lastActiveAt` are explicit `@Prop`s. Web does not register devices.

### 4.7 `Contact` — `entities/contacts.schema.ts` (DB: `fb`)

| Field | Type | Notable |
|---|---|---|
| `name` | string | indexed |
| `address` | string | indexed (email/username address) |
| `userId` | string (ref `User`) | indexed; owner of the contact entry |
| `phone` | string? | indexed; denormalized from `User.phone`, backfilled at boot; may be absent |

No custom `_id` `@Prop` (Mongo default ObjectId) and no timestamps. The web app's address book / "start chat with" picker reads these. See the contacts feature doc.

### 4.8 `PendingContact` — `entities/pending-contacts.schema.ts` (DB: `fb`)

| Field | Type | Notable |
|---|---|---|
| `phone` | string | required, indexed |
| `addedByUserId` | string (ref `User`) | indexed |
| `createdAt`, `updatedAt` | Date | `timestamps: true` |

A phone number someone added that isn't yet a registered user (drives invite/follow-back when they sign up).

### 4.9 `InvitationCode` — `entities/invitation-code.schema.ts` (DB: `fb`)

Invite-only signup. Carries Swagger `@ApiProperty` annotations (so it surfaces in OpenAPI).

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `code` | string | **required, unique** |
| `createdBy` | string (ref `User`) | default `null` |
| `usedBy` | string (ref `User`) | default `null` |
| `isUsed` | boolean | default false |
| `createdAt` | Date | default now |
| `usedAt` | Date | default `null` |
| `expiresAt` | Date | default `null` |
| `phone` | string | **required**; bound to a phone number |

Relevant to the web onboarding/signup flow (see auth feature doc).

### 4.10 `GroupChat` — `entities/group-chat.schema.ts` (DB: `fb`)

| Field | Type | Notable |
|---|---|---|
| `_id` | string | `createId` |
| `groupName` | string | required, indexed (typed `User` in source — a schema typo; it's a string name) |
| `topicId` | string | required, indexed |
| `groupUsers` | `IGroupChatUser[]` | per-user roster (`userId`, `username?`, `phone`, `isAdmin`) |
| `createdAt` | Date | default now, indexed |

Group membership/admin roster. Overlaps conceptually with `Chat` (`isGroup`); confirm which one a given group endpoint returns against the chat feature doc. The `groupName: User` typing is a known source inaccuracy — the value is a string.

### 4.11 `UserLocation` — `entities/user-location.schema.ts` (DB: `fb`)

Login/session geo + device telemetry: `userId` (ref User, indexed), `ip`, `country`, `region`, `city`, `latitude`, `longitude`, `timezone`, `userAgent`, `deviceType`, `browser`, `os`, `createdAt`. Written server-side on login for security/audit. The web client typically does not read this; it may matter for a "login activity / sessions" settings screen (confirm against RN `Services/`).

### 4.12 `Favicon` — `entities/favicon.schema.ts` (DB: `fb`)

Cache of resolved favicons for email senders' domains: `_id` (createId), `domain` (indexed), `url`. Backs `Thread.favicon`. Read-only from the client's perspective.

---

## 5. Embedded subdocument / value-object shapes

These are reused across Message (and Call). Defined in `backend/src/types/*`.

| Shape | Source | Fields |
|---|---|---|
| `contact` | inline in `message.schema.ts` | `name: string`, `address: string` |
| `MetaData` | inline in `message.schema.ts` | `from: contact`, `to: contact[]`, `cc: contact[]`, `date: Date` |
| `IReaction` | `types/reaction.ts` | `id: string`, `reaction: string`, `byUser: IByUser`, `createdAt?: Date\|null` |
| `IByUser` | `types/byUser.ts` | `userId`, `name`, `username` |
| `IAttachment` | `types/attachment.ts` | `id`, `url`, `thumbnail?`, `orientation?`, `title`, `type`, `size: number`, `placeholder?` |
| `IMessageInfo` | `types/messageInfo.ts` | `userId`, `name`, `username`, `createdAt?` (used by `readInfo`/`deliveryInfo`/`voiceListenedInfo`) |
| `IMention` | `types/mention.ts` | `userId?` (null for `everyone`), `handle`, `offset` (UTF-16 into `text`), `length`, `type: 'user'\|'everyone'` |
| `IGroupChatUser` | `types/groupChatUser.ts` | `userId`, `username?`, `phone`, `isAdmin: boolean` |

Mention rendering contract: `offset`/`length` index into `Message.text` (UTF-16 code units); the span starts with `@` and covers exactly the literal token. Overlay chip styling on those spans; fall back to plain text for unknown mentions. `handle` is frozen at insertion time so it survives renames. For email, mentions are also reflected as `<a class="unsend-mention" data-mention-user-id="…">` in the HTML body.

---

## 6. Relationship map (quick reference)

| From | Field | To | Cardinality |
|---|---|---|---|
| Thread | `userId` | User | many Threads → one User |
| Thread | `topicId` | Chat (`topicId`) | many per-user Threads ↔ one Chat |
| Thread | `lastMessage` | Message | one (denormalized) |
| Message | `threadId` | Thread | many Messages → one Thread |
| Message | `userId` | User | per-user copy (fan-out) |
| Message | `headerId` | — | groups all per-user copies of the same logical message |
| Message | `refId` (+`userId`) | — | client idempotency key |
| Message | `replyTo` | Message `_id` | reply threading |
| Chat | `topicId` | Thread/Call | conversation key |
| Chat | `participants[]`, `createdBy` | User | roster |
| Call | `topicId` | Chat | one Call → one conversation |
| Call | `callerId`, `participants[].userId` | User | |
| User | `invitationCode` | InvitationCode | signup |
| User | `wildduck_id` | WildDuck account (`wildduck` DB) | cross-DB link |
| Contact / PendingContact | `userId` / `addedByUserId` | User | address book |
| Thread | `favicon` | Favicon `url` | email sender icon |

---

## 7. Cross-links

- `01-architecture.md` — system overview, REST/WS surface, BFF.
- `04-auth-sessions-deviceid.md` — JWT, socket-token, invitation-code signup.
- `03-websocket-events.md` / socket doc — join-room quirk (event name == room name), presence symmetry, socket→Query-cache writes.
- `10-state-and-realtime.md` — inbox listing, delta sync (`updatedAt` cursors), per-user thread flags.
- `06-feature-chat.md` — send flow, `refId`/fan-out, reactions, mentions, read/delivery receipts.
- `07-feature-email.md` — `isEmail` threads, WildDuck, metadata/`headerId`/`msgid`.
- `08-feature-calls.md` — Agora channels, Call lifecycle/status, tab-open-only incoming calls.
- `09-feature-contacts-profile-settings.md` — contacts/pending contacts, "start chat" picker.
- `09-feature-contacts-profile-settings.md` — online/last-seen, symmetric privacy.

> Accuracy note: some OpenAPI-generated types for embedded arrays (reactions/attachments/metadata/mentions) may be `any`/loosely typed because the backend uses plain `@Prop` objects rather than nested `@Schema` classes for several of them. When the generated client is vague, treat the shapes in §5 (and RN `frontend/src/Types/message/index.ts`) as authoritative and verify against RN `Services/`.
