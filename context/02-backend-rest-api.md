# 02 — Backend REST API Reference

Purpose: complete, source-grounded inventory of every HTTP endpoint the existing NestJS backend exposes, so `unsendnext` can consume it as-is. Every route below was read from `backend/src/**/*.controller.ts`.

> Cross-links: data shapes in `05-data-models.md`; realtime/socket contract in `03-websocket-events.md`; email behavior in `07-feature-email.md`; calls in `08-feature-calls.md`.

---

## 1. Conventions (ground truth)

| Item | Value | Source |
|---|---|---|
| Global prefix | `/api/v1` (prepended to every controller path below) | `backend/src/main.ts` (`app.setGlobalPrefix('/api/v1')`) |
| Default port | `3000` (env `PORT`) | `backend/src/main.ts` |
| Auth scheme | Bearer JWT, Swagger security name `JWT-auth` | `backend/src/main.ts` (`addBearerAuth(..., 'JWT-auth')`) |
| Auth enforcement | Per-controller `@UseGuards(AuthGuard())` / `AuthGuard('jwt')`. **No global guard exists** — controllers WITHOUT the guard are unauthenticated. | grep: no `APP_GUARD`/`useGlobalGuards`; per-controller decorators |
| CORS | `origin: '*'`, `credentials: true`, methods `GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`, allowed headers `Content-Type, Accept` | `backend/src/main.ts` |
| Validation | Global `ValidationPipe`; 400 body is an **array of `{ [field]: firstErrorMessage }`** objects (custom `exceptionFactory`), NOT the Nest default shape | `backend/src/main.ts` |
| OpenAPI JSON | `/docs-json` (NOT under `/api/v1`); Swagger UI at `/docs`. Both **basic-auth protected** (`BASIC_ATUH_ADMIN_USER`/`...PASSWORD`, default `unsend`). | `backend/src/main.ts` |
| Body parsing | `bodyParser.urlencoded({ extended: true })` is also enabled (webhook posts form data) | `backend/src/main.ts` |

### Typed client generation
The typed API client for `unsendnext` is generated from `/docs-json` via `openapi-typescript` + `openapi-fetch`. Caveat: many handlers return plain object literals with **no response DTO** annotation, so OpenAPI will emit `any`/loosely-typed schemas for them. Endpoints flagged **[loose]** below need their shape confirmed against `frontend/src/Services/` (the RN logic layer) or `05-data-models.md` rather than trusting the generated types.

### Socket header convention
Many mutating endpoints read a socket id from request headers (`socketid` or `x-socket-id`) so the server can skip echoing the realtime event back to the originating socket. When `unsendnext` mutates over REST it should send its current socket id in one of those headers. Endpoints that honor it are marked **[socketid]**.

---

## 2. Auth — `/api/v1/auth`
Source: `backend/src/users/auth.controller.ts`. All routes **public** except `change-password`.

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | public | Register a new (unverified) user; consumes an invitation code | Body `RegisterDto` (username, phone, password, birthDate, gender, invitationCode). Validates uniqueness + invitation code; tracks IP/UA. Returns `{ success, message }`. Does NOT log in. |
| POST | `/auth/send-code` | public | Send Twilio verification code to a phone | Body `SendCodeDto` `{ phone }`. |
| POST | `/auth/resend-verification-code` | public | Resend verification code by username | Body `ResendVerificationCodeDto` `{ username }`. |
| POST | `/auth/verify` | public | Verify a registered user by phone+code; provisions Wildduck mailbox; sends welcome system message | Body `VerifyCodeDto` `{ phone, code }`. Returns `{ success, message }`. |
| POST | `/auth/create-user` | **public (no guard!)** | Create system/dummy accounts (verified immediately) | Body `CreateSystemUserDto`. **Not for client use**; flag as admin/internal. |
| POST | `/auth/login` | public | Login; returns access + refresh tokens | Body `LoginDto` `{ username, password, deviceId? }`. Returns `LoginResponseDto` `{ success, user{userId,firstName,lastName,username,phone,gender,birthDate}, accessToken, refreshToken }`. 3 failed attempts → account `blocked`. Passing `deviceId` pre-creates a device session (avoids refresh race). |
| POST | `/auth/refresh-token` | public | Exchange refresh token for new token pair | Body `{ refreshToken, deviceId? }`. Returns `{ success, accessToken, refreshToken }`. 401-style BadRequest on invalid/expired. **[loose]** body is an inline type, not a DTO class. |
| POST | `/auth/login-admin` | public | Admin login (role must be `admin`) | Body `LoginDto`. Marked `// TODO: Complete this later`. Not for web client. |
| POST | `/auth/request-password-reset` | public | Start password reset; sends code to user's phone | Body `ResetPasswordReqDto` `{ userData }` (username or phone). Returns user summary or `{ success }`. |
| POST | `/auth/verify-reset-password-code` | public | Verify reset code; returns a 1h reset token | Body `VerifyCodeDto`. Returns `{ success, message, token }`. |
| PATCH | `/auth/reset-password` | public | Apply new password using reset token | Body `ResetPasswordDto` `{ token, password }`. Clears lock/otp state. |
| PATCH | `/auth/change-password` | **Bearer** | Change password for the authenticated user | Body `ChangePasswordDto` `{ oldPassword, newPassword }`. |

---

## 3. Users — `/api/v1/users`
Source: `backend/src/users/users.controller.ts`. Whole controller is **Bearer** (`@UseGuards(AuthGuard())`).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/users/user/:userData` | Lookup a single user by username or phone | Returns `{ status:'OK', data:{ userId, username, phone, name } }`; 404 if missing. |
| GET | `/users/search/:userData` | Search users by username/name | **[loose]** returns service result, no DTO. |
| GET | `/users/admin/count` | Total user count (admin/metrics) | **[loose]**. Admin-flavored; no role guard present (note). |
| GET | `/users/admin/all` | All users (admin) | **[loose]**. No role guard present. |
| GET | `/users/admin/recent` | Recent users (admin) | **[loose]**. No role guard present. |
| GET | `/users/avatar-changes?since=<ms>` | Avatar versions changed since a timestamp (poll for cache busting) | Query `since` (epoch ms, required). Returns `AvatarChangesResponseDto`. |
| PATCH | `/users/me` | Update the authenticated user's profile fields | Body `UpdateProfileDto` → `UpdateProfileResponseDto`. **[socketid]**. |
| POST | `/users/me/phone/send-code` | Send Twilio code to a candidate new phone | Body `StartPhoneChangeDto` `{ phone }` → `StartPhoneChangeResponseDto`. |
| POST | `/users/me/phone/verify` | Confirm code and apply new phone number | Body `VerifyPhoneChangeDto` `{ phone, code }` → `UpdateProfileResponseDto`. **[socketid]**. |
| POST | `/users/update-avatar` | Bump avatar version (after uploading via Settings signed URL) | Body `UpdateAvatarVersionDto` `{ username }` → `UpdateAvatarVersionResponseDto`. **[socketid]**. |

### Presence — `/api/v1/users/presence`
Source: `backend/src/users/presence.controller.ts`. **Bearer.**

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/users/presence` | Seed online + last-seen for a list of usernames | Body `{ usernames?: string[] }`. Returns `{ online: string[], lastSeen: Record<username, ISO8601> }`. **Symmetric privacy**: if the requester has `showOnlineStatus=false`, returns empty. Targets with `showOnlineStatus=false` are excluded; targets with `showLastSeen=false` omitted from `lastSeen`. Live updates come via socket events `presence:online`/`presence:offline` (see `03-websocket-events.md`). |

### Privacy — `/api/v1/users/me/privacy`
Source: `backend/src/users/privacy.controller.ts`. **Bearer.**

| Method | Path | Purpose | Notes |
|---|---|---|---|
| PATCH | `/users/me/privacy` | Toggle online-status / last-seen visibility | Body `UpdatePrivacyDto`. Returns `{ showOnlineStatus, showLastSeen }`. These flags drive the symmetric presence gate above. |

> Note: `backend/src/users/settings.controller.ts` is an **empty stub** (`@Controller('settings')` with no routes). The real signed-URL endpoint lives in `backend/src/settings/settings.controller.ts` — see §13.

---

## 4. Devices — `/api/v1/devices`
Source: `backend/src/users/user-devices.controller.ts`. Controller is `@ApiBearerAuth`; each route guards with `JwtWithDeviceGuard` (JWT + device validation). `SkipDeviceValidation()` on register.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/devices/` | List my registered devices | Returns `{ success, devices[] }` with `isCurrent` flag derived from the token's `deviceId`. |
| POST | `/devices/` | Register/upsert a device (skips device validation) | Body `CreateDeviceDto`. 201 `{ success, message }`. Call after login to register the web "device". |
| PUT | `/devices/device/:deviceId/voip-token` | Update VoIP push token | Body `{ voipToken }`. **Mobile-only** — web has no VoIP; not needed for `unsendnext`. |
| DELETE | `/devices/device/:deviceId` | Delete a registered device | `{ success, message }`. |
| PATCH | `/devices/badge-reset/device/:deviceId` | Reset push badge count | `{ success, message }`. |
| GET | `/devices/badge-count/device/:deviceId` | Get badge count | `{ success, badgeCount }`. |
| PATCH | `/devices/activity/device/:deviceId` | Heartbeat: update device `lastActiveAt` | `{ success, message }`. |
| DELETE | `/devices/my-other-devices` | Delete all devices except the current one | Emits `sessionInvalidate` socket event to other sessions. Returns `{ success, message, count }`. |
| DELETE | `/devices/user/:userId/all` | **Admin** — delete all of a user's devices | Adds `RolesGuard` + `@Roles(ADMIN)`. Emits `sessionInvalidate`. |
| DELETE | `/devices/:deviceId` | Delete a device by id (owner or admin) | 403 if not owner/admin, 404 if missing. Emits `sessionInvalidate`. (Note: route order — this generic `:deviceId` is declared after the more specific routes above.) |

---

## 5. Invitation codes — `/api/v1/invitation-codes`
Source: `backend/src/users/invitation-codes.controller.ts`. **Admin-only**: `@UseGuards(AuthGuard(), RolesGuard)` + `@Roles(ADMIN)` per route. No `@ApiTags` (may be ungrouped in OpenAPI).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/invitation-codes` | Create an invitation code | Body `CreateInvitationCodeDto`. Admin only. |
| GET | `/invitation-codes` | List invitation codes created by the admin | Returns `InvitationCode[]`. |
| GET | `/invitation-codes/:code` | Get a single invitation code | Admin only. |

> Registration (`/auth/register`) consumes these codes but is public; the management endpoints here are admin-only and not part of the standard web client flow.

---

## 6. Threads — `/api/v1/threads`
Source: `backend/src/threads/threads.controller.ts`. **Bearer.** A "conversation" = many per-user Thread docs sharing one `topicId` (see `05-data-models.md`). These threads endpoints are also the **de-facto email-list API** — see `07-feature-email.md`.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/threads/metadata` | Fetch lightweight metadata for **all** threads at once (WhatsApp-style, no pagination) | Returns `{ data: [...], totalCount }`. **[loose]** (no DTO). Primary list-load endpoint. |
| GET | `/threads/metadata/page/:page/size/:size` | Paginated sweep of the same metadata, stable `_id`-asc order | For very large accounts / streamed ingest. **[loose]**. |
| GET | `/threads/filter/:filter/page/:page/size/:size` | Fetch threads by filter (inbox/spam/etc.), paginated | `:filter` is `FetchThreadsFilterEnum`. Returns `FetchThreadsDto`. |
| GET | `/threads/sync/:lastSyncTime` | Delta-sync threads updated since an ISO timestamp | Returns `SyncThreadsResponseDto`-ish `{ threads, deletedThreadIds, syncTime, updatedCount, deletedCount }`. |
| GET | `/threads/health-check` | Lightweight metadata for client sync-integrity validation | Returns `HealthCheckResponseDto`. |
| PUT | `/threads/update` | Mutate thread state (spam, delete, bookmark, pin, silent, …) | Body `UpdateThreadsDto`. **[socketid]**. |
| GET | `/threads/bulk?ids=a,b,c&messageLimit=20` | Bulk-fetch threads + their latest messages | `ids` comma-separated; `messageLimit` default 20. Returns `{ threads, messages }`. **[loose]**. Only returns threads owned by the caller. |
| GET | `/threads/:id` | Get one thread (merged with chat info: participants, name, icon, counts) | 404 if thread or chat missing. Returns `threadFactory(...)` shape. **[loose]**. NOTE: declared after `/bulk`, `/sync`, etc. — those literal paths take precedence over `:id`. |

---

## 7. Messages — `/api/v1/messages`
Source: `backend/src/messages/messages.controller.ts`. **Bearer.** Core send/read/edit/react surface for chat AND email. **Idempotency:** sends carry a client-supplied `refId` (UUID); the server is idempotent on `(userId + refId)` so retries don't duplicate (see `05-data-models.md`).

### Send / compose / forward

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/messages/` | Send a new message (auto-creates chat/topic if none) | Body `SendMessageDto` (`toList`, `ccList`, `bccList`, `text`, `html`, `subject`, `isEmail`, `isChat`, `isGroup`, `topicId?`, `threadId?`, `attachments`, `refId`, …). Returns `SendMessageResponseDto`. May return `{ failedToSend:true, message }` if sender isn't a participant. **[socketid]**. This single endpoint covers chat messages AND outbound email (when `isEmail`). |
| POST | `/messages/forward` | Forward one or more messages (+ optional reply note) | Body `ForwardMessagesDto`. Returns an `IThread<IMessage>`. 201. **[socketid]**. |
| POST | `/messages/chat/user` | Resolve an existing 1:1 chat for given participants | Body `ChatParticipantsDto` `{ participants }`. Returns `{ success, topicId, threadId, isGroup }`; 404 if no chat. |

### Read / paginate / sync

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/messages/thread/:id/page/:page/size/:size` | Offset-paginated thread messages | **DEPRECATED** (`deprecated:true`). Use the cursor route below. Returns `FetchThreadMessagesDto`. |
| GET | `/messages/thread/:id/before/:cursor/size/:size` | Cursor back-scroll; messages strictly older than `:cursor`, newest first | `:cursor` = literal `head` (newest page / polling) or a `messageId`. Returns `FetchOlderMessagesDto` `{ data, hasMore }`. Unknown id → `{ data:[], hasMore:false }`. **Preferred** read path. |
| GET | `/messages/sync/:lastSyncTime` | Delta-sync all messages updated since ISO timestamp | Returns `{ messages, deletedMessageIds, syncTime, hasMore, updatedCount, deletedCount }` (`SyncMessagesResponseDto`). Page size 500; loop on `hasMore` using returned `syncTime`. 400 on bad date. |
| GET | `/messages/mentions?limit=&before=` | Mentions inbox — messages where caller is @mentioned | Cursor `before=<ISO>`. **[loose]**. |
| POST | `/messages/bulk-fetch` | Fetch messages for many threads in one call (avoids N+1 on initial load) | Body `BulkFetchMessagesRequestDto` `{ threadIds, limit }` → `{ messages, totalMessages, threadsCount }`. |
| GET | `/messages/message/:id` | Fetch a single message's stored HTML (email body) | **[loose]**. Used to render full email HTML on demand. See `07-feature-email.md`. |

### Receipts / read state

| Method | Path | Purpose | Notes |
|---|---|---|---|
| PATCH | `/messages/thread/:id/seen` | Mark a thread's messages seen + delivered | `{ success }`. **[socketid]**. |
| PATCH | `/messages/threads/bulk-seen` | Bulk mark many threads seen + delivered | Body `BulkThreadsSeenDto` `{ threadIds }`. **[socketid]**. |
| PATCH | `/messages/delivered/:messageId` | Mark one message delivered | `{ success }`. **[socketid]**. |
| PATCH | `/messages/delivered` | Mark many messages delivered | Body `BulkDeliveredDto` `{ messageIds }` → `{ success, messagesProcessed }`. **[socketid]**. |
| PATCH | `/messages/voice-listened/:messageId` | Mark a voice note as listened | `{ success }`. **[socketid]**. |

### Edit / delete

| Method | Path | Purpose | Notes |
|---|---|---|---|
| PATCH | `/messages/message/:id` | Edit a message's text (for everyone) | Body `EditMessageDto` `{ text }` → `{ success, message:'updated for all' }`. **[socketid]**. |
| DELETE | `/messages/forMe` | Delete messages for me only | Body `DeleteMessagesForMeDto` `{ headerIds }`. **[socketid]**. |
| DELETE | `/messages/message/:id` | Delete a message for everyone (unsend) | `{ success, message:'delete for all' }`. **[socketid]**. |

### Reactions

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/messages/message/:id/reaction/:reaction` | Add/replace caller's reaction (emoji in path) | One reaction per user (replaces existing). 404 if message unsent. Returns `messageFactory(message)` (`MessageResponseDto`). **[socketid]**. |
| DELETE | `/messages/header/:id/reaction/:reactionId` | Remove a reaction by id (keyed by `headerId`) | `{ success, message:'reaction removed' }`. **[socketid]**. |
| GET | `/messages/message/:id/reactions` | List a message's reactions | Returns `ReactionsResponseDto[]`; 404 if message missing. |

### Attachments & misc

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/messages/attachment/:filename` | Get a single pre-signed S3 **upload** URL (simple uploads) | Returns `UploadUrlResponseDto` `{ url, filename }`. For large/multipart uploads use `/attachment/*` (§12). |
| GET | `/messages/userChats` | Most-popular + most-recent chats for compose suggestions | Returns `UserChatsResponseDto`. |
| GET | `/messages/chat/search?qry=&page=&size=` | Search the caller's chats | `qry` optional. Returns `SearchUserChatsDto` + `page`. |
| GET | `/messages/count` | Global message + chat counts (admin/metrics) | `{ messageCount, chatCount }`. No role guard — admin-flavored. **[loose]**. |
| GET | `/messages/monthgrouped` | Messages grouped by month (admin/metrics) | **[loose]**. Admin-flavored. |

---

## 8. Chat (group/topic management) — `/api/v1/chat`
Source: `backend/src/messages/chat.controller.ts`. **Bearer.** Operates on the shared `topicId` (the chat doc behind a conversation).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| PUT | `/chat/:topicId` | Update chat info (name, etc.) | Body `UpdateSingleThreadDto`. **[socketid]**. |
| PUT | `/chat/:topicId/participants` | Add/remove chat participants | Body `UpdateParticipantsDto` `{ participants }`. **[socketid]**. |
| PUT | `/chat/:topicId/leave` | Leave a group chat | **[socketid]**. |

---

## 9. Public messages — `/api/v1/public-messages`
Source: `backend/src/messages/public-messages.controller.ts`. **No auth guard — public.** Identifies the receiver from the message itself, so no bearer needed (used by mail-pixel / server-side hooks). Not required by `unsendnext`; document for completeness.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| PATCH | `/public-messages/delivered/:messageId` | Mark a message delivered (receiver resolved from message) | 404 if message/user missing. |
| PATCH | `/public-messages/voice-listened/:messageId` | Mark a voice note listened (receiver resolved from message) | 404 if message/user missing. |

---

## 10. Contacts — `/api/v1/contacts`
Source: `backend/src/contacts/contacts.controller.ts`. **Bearer.**

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/contacts/` | Fetch the caller's contacts | Returns `{ contacts: [{ name, address, phone }] }`. (`@Param('address')` here is vestigial — route has no path param.) |
| POST | `/contacts` | Create contacts from raw phone numbers | Body `CreateContactDto` `{ phones }` → `ContactResponseDto[]`. |
| POST | `/contacts/import` | Bulk-match imported device contacts to platform users | Body `ImportContactsRequestDto` `{ contacts }` → `ImportContactsResponseDto`. Phone-book centric; web may have limited use. |
| GET | `/contacts/pending` | Pending (invited-but-not-yet-registered) contacts | Returns `{ pendingContacts }`. |
| GET | `/contacts/search/:search` | Search the caller's contacts | **[loose]** (returns service result). |
| GET | `/contacts/address/:address` | Resolve a platform user by email address | Returns `{ name, address }`; 404 if not found. |
| GET | `/contacts/byPhone/:phone` | Resolve a platform user by full phone | Returns `{ name, address, phone }`; 404 if not found. |

> Route-order note: literal segments (`/pending`, `/search/:search`, `/address/:address`, `/byPhone/:phone`, `/import`) are distinct, so no collision with `/`.

---

## 11. Calls — `/api/v1/calls`
Source: `backend/src/calls/calls.controller.ts`. **Bearer.** Agora-backed voice/video. On web, incoming calls only work while a tab is open (no VoIP/background push — out of scope; see product notes). Several endpoints below are **[loose]** (no response DTO, return raw service results).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/calls/start` | Start a call to a topic or a recipient | Body `StartCallDto` `{ topicId?, recipientUsername?, isVideoCall }` (at least one of topicId/recipientUsername; topicId wins). Returns `ICallNotificationPayload` incl. `channelName`, `agoraToken`, `agoraUsername`, `participants[]`, `caller`, `type`, `uuid`. **[socketid]**. This is the primary call-initiation endpoint. |
| POST | `/calls` | Create a call record directly | Body `CreateCallDto`. **[loose]**. Lower-level; prefer `/calls/start`. |
| GET | `/calls/uuid/:uuid` | Get a call by UUID | **[loose]**. |
| GET | `/calls/topic/:topicId` | Get calls for a topic | **[loose]**. |
| GET | `/calls/channel/:channelName` | Get a call by Agora channel name | **[loose]**. |
| PUT | `/calls/:uuid` | Update a call (status, etc.) | Body `UpdateCallDto`. **[loose]**. |
| PUT | `/calls/:uuid/participant/:username` | Update a participant (mute/video/hold) | Body `UpdateParticipantDto`. **[loose]**. |
| GET | `/calls/user/:userId/active` | Active calls for a user | **[loose]**. |
| GET | `/calls/topic/:topicId/history?limit=50` | Call history for a topic | **[loose]**. |
| GET | `/calls/history?limit=100` | Call history for the caller | **[loose]**. |
| GET | `/calls/sync/:lastSyncTime` | Delta-sync calls since ISO timestamp | Returns `SyncCallsResponseDto` `{ calls, deletedCallUUIDs, syncTime, updatedCount, deletedCount }`. 400 on bad date. |
| POST | `/calls/:uuid/received` | Mark incoming call as received (notifies caller) | 404 if call not found. |

> Route-order note: `/calls/uuid/:uuid`, `/calls/topic/...`, `/calls/channel/...`, `/calls/user/...`, `/calls/history`, `/calls/sync/...`, `/calls/start` are all distinct from the bare `PUT /calls/:uuid`, so the literal GET/POST routes resolve correctly.

---

## 12. Attachments (AWS multipart upload) — `/api/v1/attachment`
Source: `backend/src/aws/aws.controller.ts`. **Bearer.** Tag `Attachments`. Multipart S3 upload flow for large files; for a single simple upload URL use `GET /messages/attachment/:filename` (§7).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/attachment/start-upload` | Begin a multipart upload | Body `StartUploadDto` `{ filename, contentType }` → `StartUploadResponseDto` `{ uploadId }`. On error returns `{ status:'Failed', error }` (200, NOT a thrown error). **[loose]** on failure. |
| GET | `/attachment/get-upload-url/filename/:filename/part-number/:partNumber/upload-id/:uploadId` | Pre-signed URL for one part | Returns `{ url }` (or `{ status:'Failed', error }`). |
| POST | `/attachment/complete-upload` | Finalize the multipart upload | Body `CompleteUploadDto` `{ filename, uploadId, parts }` → `{ data }` (or `{ status:'Failed', error }`). **[loose]**. |

Upload flow: `start-upload` → per-part `get-upload-url` → PUT each part to S3 → `complete-upload`.

---

## 13. Settings (profile image upload URL) — `/api/v1/settings`
Source: `backend/src/settings/settings.controller.ts`. **Bearer.** (The `users/settings.controller.ts` stub has no routes.)

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/settings/profileImage/:filename` | Pre-signed S3 upload URL for the caller's profile image | Returns `UploadUrlResponseDto` `{ url, filename }`. After uploading, bump avatar via `POST /users/update-avatar`. |

---

## 14. Favicon — `/api/v1/favicon`
Source: `backend/src/favicon/favicon.controller.ts`. **No auth guard — public.**

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/favicon/:email` | Resolve a brand/sender favicon for an email/domain | **[loose]** return. Useful for email sender avatars in the inbox UI. |

---

## 15. Webhook — `/api/v1/webhook`
Source: `backend/src/webhook/webhook.controller.ts`. **No auth guard — public.** Inbound mail-server callback, NOT for the web client.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/webhook` | Receive inbound-email notification (form post); publishes `{ msgid, user }` to RabbitMQ | Uses `FileInterceptor` (placeholder field name in source). Returns `'Ok'`. Internal/infra only. |

---

## 16. Email controller — mostly NOT HTTP
Source: `backend/src/email/email.controller.ts`. This is primarily a **RabbitMQ consumer**, not a REST surface. It handles `@MessagePattern('incoming-emails')`, `'incoming-emails-requeue'`, and `'outgoing-emails')` (queues configured in `main.ts`). It exposes only one HTTP route:

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/email/` | Dev/simulation hook to reprocess an incoming email | **No auth.** Internal/testing only — do NOT use from `unsendnext`. |

**The de-facto "email API" for the web client is the Threads (§6) + Messages (§7) endpoints**, not this controller. Sending email = `POST /messages/` with `isEmail`; listing = `/threads/*`; full email HTML = `GET /messages/message/:id`. See `07-feature-email.md`.

---

## 17. Admin / ops / health — NON-CLIENT (do not consume from `unsendnext`)

These exist for admins/monitoring/infra. Several render EJS HTML or expose Prometheus text, are basic-auth- or role-guarded, or are unauthenticated infra hooks. Listed so the typed client can ignore them.

| Controller | Base | Auth | Notes |
|---|---|---|---|
| `metrics/metrics.controller.ts` | `/api/v1/metrics` | none | `GET /metrics` → Prometheus text (`content-type` from registry). Monitoring scrape. |
| `system-health/system-health.controller.ts` | `/api/v1/system-health` | **basic-auth** (middleware in `main.ts`) | `GET /` and `GET /section/:sectionId` render EJS dashboards; many `POST` ops actions (force-end-call, delete/merge duplicate chats, delete threads, delete/clear devices); plus `GET /users`, `/users/search`, `/users/:userId/devices` (JSON). Admin ops UI. |
| `system-health/dashboard.controller.ts` | `/api/v1/app/dashboard` (also proxied `/app/dashboard`) | **basic-auth** (`DASHBOARD_AUTH_*`) | EJS admin dashboard + user/device management; deletes user data via `AdminActionsService`. Next.js dashboard is reverse-proxied (`/_next`, `/app/dashboard`). |
| `admin-actions/admin-actions.controller.ts` | `/api/v1/admin-actions` | **Bearer + RolesGuard ADMIN** | `DELETE /delete-user`, `DELETE /delete-user-data` (body `DeleteUserDto`). Admin only. |
| `rbtmq_publisher/rbtmq_publisher.controller.ts` | `/api/v1/rbtmq` | none | `GET /health`, `POST /reconnect` — RabbitMQ publisher ops. Infra only. |
| `app.controller.ts` | `/api/v1` (root) | n/a | No routes (empty). |
| `notifications/notifications.controller.ts` | `/api/v1/notifications` | n/a | No HTTP routes (empty controller; logic is event-driven). |
| `users/settings.controller.ts` | `/api/v1/settings` | n/a | Empty stub, no routes (real settings route in §13). |

> Several "admin-flavored" routes also live inside otherwise-client controllers and currently have **no role guard**: `GET /users/admin/count|all|recent`, `GET /messages/count`, `GET /messages/monthgrouped`. They work with any valid bearer token but are intended for admin/metrics — `unsendnext` should not surface them.

---

## 18. Quick gotchas for the typed client

1. **400 error shape is non-standard** — an array of single-key objects (`[{ field: message }]`), per the custom `exceptionFactory`. Build error parsing around that.
2. Many handlers return inline object literals with **no DTO** → OpenAPI types are `any`/loose. Confirm shapes against `frontend/src/Services/` and `05-data-models.md` before trusting generated types (all such routes flagged **[loose]**).
3. Several upload endpoints return `200` with `{ status:'Failed', error }` instead of an HTTP error — check the body, not just the status.
4. `/docs-json` is basic-auth protected — the codegen step must supply those creds.
5. Send `socketid` (or `x-socket-id`) header on mutating calls so the server suppresses the echo event to your own socket (routes flagged **[socketid]**).
6. Public (no-bearer) endpoints: all of `/auth/*` except change-password, `/public-messages/*`, `/favicon/:email`, `/webhook`, `/email/`, `/metrics`, `/rbtmq/*`. Everything else needs a Bearer JWT (and `/devices/*` additionally validates the device via `JwtWithDeviceGuard`).
