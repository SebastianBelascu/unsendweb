# 07 — Email Feature Spec (unsendnext)

> Purpose: how the Next.js web client implements the email experience (mailbox tabs, thread reading, compose/reply/forward, thread actions, safe HTML rendering, attachments, favicons) against the **unchanged** NestJS backend over REST.

Email is NOT a dedicated subsystem on the backend. There is **no `/emails` controller**. Email is just the *email-shaped* projection of the shared **Threads + Messages** domain (`isEmail: true`). A "conversation" is multiple per-user `Thread` documents sharing one `topicId` (see quirk #4 and `05-data-models.md`). Realtime delivery/seen/new-message events arrive over the socket and must be written into the Query cache (see `03-websocket-events.md`).

All routes below are under the global prefix **`/api/v1`** and require `Authorization: Bearer <JWT>` unless noted. Generate the typed client from `/docs-json` (openapi-typescript + openapi-fetch); where OpenAPI types are loose (`object` / `any`), confirm shapes against `frontend/src/Types/` and `frontend/src/Services/`.

Source of truth read for this doc:
- `backend/src/threads/threads.controller.ts`, `backend/src/threads/threads.service.ts`
- `backend/src/threads/dtos/fetch-threads-filter.enum.ts`, `backend/src/threads/dtos/update-thread.dto.ts`
- `backend/src/messages/messages.controller.ts`, `backend/src/messages/dtos/sendMessage.dto.ts`, `forward-messages.dto.ts`, `forward-email.dto.ts`, `address.dto.ts`, `attachment.dto.ts`
- `backend/src/aws/aws.controller.ts`, `backend/src/aws/aws.service.ts`, `backend/src/aws/dtos/*.ts`
- `backend/src/favicon/favicon.controller.ts`, `backend/src/favicon/favicon.service.ts`
- `frontend/src/Constants/api.ts`, `frontend/src/Services/attachment.ts`, `frontend/src/Types/message/index.ts`, `frontend/src/Types/attachment/index.ts`

---

## 1. Mailbox tabs → thread filters

Mailbox tabs map directly onto one filtered, paginated threads endpoint:

`GET /api/v1/threads/filter/:filter/page/:page/size/:size`

`:filter` is `FetchThreadsFilterEnum` (`backend/src/threads/dtos/fetch-threads-filter.enum.ts`). **Note the enum *values* are the raw field names, not friendly slugs** — the URL segment is the value (e.g. `inbox`, `isSpam`).

| Tab          | Enum member  | URL value      | Server query (`threads.service.ts > fetchThreads`)              |
| ------------ | ------------ | -------------- | -------------------------------------------------------------- |
| Inbox        | `INBOX`      | `inbox`        | `isPinned:false, isDeleted:false, isSpam:false`                |
| Bookmarked   | `BOOKMARKED` | `isBookmarked` | `isBookmarked:true, isDeleted:false, isSpam:false`             |
| Pinned       | `PINNED`     | `isPinned`     | `isPinned:true, isDeleted:false, isSpam:false`                 |
| Spam         | `SPAM`       | `isSpam`       | `isSpam:true, isDeleted:false`                                 |
| Promotional  | `PROMOTIONAL`| `isPromotional`| `isPromotional:true, isDeleted:false, isSpam:false`            |
| Deleted/Trash| `DELETED`    | `isDeleted`    | `isDeleted:true`                                               |

Behavior notes:
- **Inbox excludes pinned threads** (`isPinned:false`). To render Gmail-style "Pinned over Inbox", fetch the `isPinned` tab separately and render it as a section above Inbox.
- Sorted `updatedAt: -1`; offset pagination (`skip/limit`). Response: `{ data: IThread[], totalCount, currentPage, totalPages }`.
- This endpoint mixes chat and email threads — there is no server-side email-only filter. Distinguish on the client via `thread.isEmail` / `thread.isChat` (both present in the thread metadata projection).
- `lastMessage` is populated **without `html`** here (`.populate({ path:'lastMessage', select:'-html' })`) — list rows get preview fields only; the full body is fetched on demand (§3).

### Other thread-listing endpoints (for initial load / large accounts)
These return **all** threads (no filter param) and exist for the WhatsApp/Telegram-style "load all metadata once" pattern:

| Endpoint | Use |
| --- | --- |
| `GET /threads/metadata` | All thread metadata in one shot (`limit 10000`), `updatedAt desc`. Lightweight projection; `lastMessage` preview text truncated to 150 chars. |
| `GET /threads/metadata/page/:page/size/:size` | Same projection, stable `_id asc` paging for 100k–1M-thread accounts. |
| `GET /threads/bulk?ids=a,b,c&messageLimit=20` | Bulk fetch threads **with** their latest messages — good for hydrating a virtualized list viewport. |
| `GET /threads/:id` | One thread with chat data (participants, chatName, chatIcon). |

For the web client, prefer the filtered `/filter/...` route for tab rendering and `/threads/bulk` for viewport hydration; reserve `/metadata*` for a full background prime if desired.

### Delta-sync & health-check
- `GET /threads/sync/:lastSyncTime` — ISO timestamp; returns `{ threads, deletedThreadIds, syncTime, updatedCount, deletedCount }`. Capped at 1000 updated threads/call. Server sets `syncTime` **after** querying (race-safe); persist the returned `syncTime` and pass it next time. Deletions arrive as `deletedThreadIds`.
- `GET /threads/health-check` — `{ totalCount, threads:[{threadId, lastMessageId, updatedAt}], timestamp }` to detect drift between the client cache and server.
- Message-level delta sync is separate: `GET /messages/sync/:lastSyncTime` (paginates 500/call; loop while `hasMore`). See `10-state-and-realtime.md` for how to reconcile delta sync with live socket events.

---

## 2. Thread / message data shapes (what to render)

The thread metadata projection (from `threads.service.ts`) carries the row fields the inbox needs: `_id`/`threadId`, `topicId`, `subject`, the state booleans (`isSpam/isPromotional/isBookmarked/isDeleted/isPinned/isSilent`), `pinDate`, `isEmail/isGroup/isChat/isForwardedEmail`, `favicon`, `threadRef`, `participants[]`, `chatName`, `chatIcon`, `messageCounts`, and a preview `lastMessage` (`from/to/cc/bcc/subject/text(≤150)/createdAt/hasAttachment/seen`).

A full email `Message` (see `frontend/src/Types/message/index.ts`, the canonical shape since OpenAPI is loose here) has: `from: Email`, `to: Email[]`, `cc: Email[]`, `bcc?: Email[]`, `subject` (carried on thread), `text`, `html: string | null`, `hasHtml`, `attachments: Attachment[]`, `seen`, `forwarded`, `forwardedFrom`, `originalSubject`, `isPromotional`, `reactions`, `createdAt`. An `Email` address = `{ name, address, phone?, type? }`. See `05-data-models.md` for the full entity reference.

---

## 3. Reading message bodies

List/metadata responses deliberately omit `html`. To render an opened email body:

`GET /api/v1/messages/message/:id` → `{ html }` (service: `fetchMessageHtml`, selects `html` only).

Thread message lists (the per-thread scrollback) use the **cursor** endpoint (offset variant is deprecated):

`GET /api/v1/messages/thread/:id/before/:cursor/size/:size`
- `:cursor` = literal `head` for the newest page (initial open + polling), or a `messageId` to page strictly older. Returns `{ data, hasMore }`, newest-first. Unknown id → `{ data:[], hasMore:false }`.

Mark read when an email is opened: `PATCH /messages/thread/:id/seen` (send `socketid` header so the server can skip echoing to the originating tab — see `03-websocket-events.md`).

> Web rendering note: `html` may be present on the message object for chat-style bodies but is stripped from email *list* projections. Treat the dedicated `GET /messages/message/:id` as the authoritative source for an email's HTML body and lazy-fetch it on open. Always pass the body through the sanitizer in §4.

---

## 4. Safe HTML email rendering on web (critical)

Emails are untrusted, arbitrary HTML/CSS authored by third parties. Rendering it in the main document would leak styles, run scripts, exfiltrate via remote requests, and let tracking pixels phone home. Defense-in-depth, all layers required:

### 4.1 Sandboxed iframe (primary isolation)
- Render each email body inside an `<iframe>` whose content is set via `srcdoc` (the sanitized HTML), **not** by pointing `src` at a backend URL.
- `sandbox` attribute set **without `allow-scripts`** and without `allow-same-origin`. With no `allow-same-origin`, the frame is a unique opaque origin and cannot read parent cookies/`localStorage` or reach the app's same-origin APIs. Do **not** combine `allow-scripts` + `allow-same-origin` (that pairing defeats the sandbox).
- Add `referrerpolicy="no-referrer"` so any allowed sub-resource fetch doesn't leak the app URL.

### 4.2 DOMPurify (sanitize before it ever reaches the DOM)
- Run the body through **DOMPurify** before injecting into `srcdoc`. Strip `<script>`, event handlers (`on*`), `javascript:`/`data:` (for active types) URLs, `<form>`/`<object>`/`<embed>`/`<iframe>`/`<meta http-equiv=refresh>`.
- Email needs inline styles, so keep `style`/`class` and the usual presentational tags/attrs, but forbid `position:fixed`, expressions, and `@import`.
- This is the same trust posture the RN app uses for email HTML; on web DOMPurify + iframe replaces the native WebView isolation.

### 4.3 CSP for the iframe document
- Prepend a `<meta http-equiv="Content-Security-Policy">` inside the `srcdoc` document. Default-deny, then selectively allow:
  - `default-src 'none'`
  - `style-src 'unsafe-inline'` (inline email CSS)
  - `img-src` — **`data:` only by default** (no remote). Flip to allow `https:` only when the user opts in (§4.4).
  - `script-src 'none'`, `frame-src 'none'`, `connect-src 'none'`, `form-action 'none'`.
- CSP is belt-and-suspenders behind the sandbox: even if sanitization misses something, network egress and scripts stay blocked.

### 4.4 Block remote content by default (tracking pixels) + "Load remote images"
- Default: **do not load remote resources.** During sanitize, rewrite remote `src`/`srcset`/`background`/`url(...)` (and CSS `background-image`) to a neutral placeholder (or strip), preventing tracking-pixel / open-tracking beacons from firing on open.
- Show a per-email banner: **"Images in this message are blocked. [Load remote images]"**.
- On click, re-sanitize with remote `img-src https:` permitted and re-render. Persist the choice per sender/domain if matching mobile UX; otherwise per-open is fine. Keep this state in Zustand (ephemeral) — it is not a server entity.
- Note: there is no backend proxy for remote images (the backend is unchanged); loading them is a direct browser fetch to the sender's host, which is exactly the privacy trade-off the toggle gates.

### 4.5 iframe height sizing
- Sandboxed/cross-origin frames can't call out to the parent. Size by: temporarily attaching a `ResizeObserver`/reading `documentElement.scrollHeight` is **not** available cross-origin, so instead set the iframe to a starting height, then on `load` measure via a `srcdoc`-injected sizing shim is impossible without scripts. Practical approach for a no-script sandbox:
  - Render to an off-screen measuring container first (same sanitized HTML) to compute natural height, then set the iframe `height`; **or**
  - Use a one-time `allow-scripts`-free trick is not possible, so the pragmatic option many web mail clients use is a tiny, audited resize script injected into the frame combined with `allow-scripts` *only* (still no `allow-same-origin`). If you accept that, the script may only `postMessage` its `scrollHeight`; the parent listens and sets `height`. Document the choice explicitly and keep the injected script minimal and fixed (not from the email).
- Recommended default: **no-script sandbox + offscreen measurement** for safety; opt into the postMessage-resize variant only if measurement proves insufficient. Re-measure on the "load remote images" re-render and on container width changes.

### 4.6 Link handling
- All anchors: force `target="_blank"` and `rel="noopener noreferrer"` during sanitize so links open in a new tab and the opened page can't reach `window.opener`.
- Strip `javascript:` and other active-scheme hrefs; allow `http(s):` and `mailto:` only.
- `mailto:` links should ideally be intercepted to open the in-app composer (§5) prefilled — but since the frame is sandboxed and can't message the parent without scripts, treat `mailto:` as a normal new-tab link unless you adopt the postMessage variant in §4.5.

---

## 5. Compose / Reply / Forward

### 5.1 Send (compose + reply): `POST /api/v1/messages`
Body = `SendMessageDto` (`backend/src/messages/dtos/sendMessage.dto.ts`). For email set **`isEmail: true`**.

Key fields:

| Field | Type | Notes |
| --- | --- | --- |
| `refId` | UUID v4 (optional but **send it**) | Idempotency key on `(userId+refId)` — a retried POST returns the existing message instead of duplicating (quirk #3). Generate client-side per outgoing email. |
| `isEmail` | boolean | `true` for email. |
| `toList` | `AddressDto[]` (**required, min 1**) | `{ name, address, phone? }`; `address` must be a valid email. |
| `ccList` | `AddressDto[]` | optional. |
| `bccList` | `AddressDto[]` | optional. **BCC is stored but excluded from chat fan-out logic** (controller comment); recipients still get it as a real email BCC. |
| `subject` | string | email subject. |
| `html` | string | the composed HTML body (server stores/sends as-is). |
| `text` | string | plaintext alternative. |
| `attachments` | `AttachmentDto[]` | see §6 — `{ id?, url, title, type, size, thumbnail?, placeholder? }`. |
| `topicId` | string | **omit for a brand-new compose**; the server creates a chat + `topicId`. Include to reply within an existing conversation. |
| `threadId` | string | the caller's per-user thread (for replies). |
| `replyTo` | string | message id being replied to (threading). |
| `from` | `AddressDto` | usually server-derived from the JWT user; optional. |

Server behavior worth knowing (`messages.controller.ts > sendMessage`):
- If no `topicId` and not a found chat, it **creates a new chat** (new `topicId`) and per-user threads — this is the compose path.
- Participants are derived from `toList + ccList + senderAddress`; **BCC is not added to participants**.
- If the sender isn't a participant in an existing chat, the send is rejected (`{ failedToSend:true, message }`) — except a BCC'd user replying into an email thread is allowed (`isUserBCCedInThread`).
- On idempotent replay (dup `refId`) the message count is **not** re-incremented.
- Pass header `socketid` (or `x-socket-id`) so the gateway doesn't echo the new-message event back to the sending tab.

**Reply** = same endpoint with `isEmail:true`, the existing `topicId`/`threadId`, prior `subject` (or `Re: …`), and `replyTo` set.

### 5.2 Forward: `POST /api/v1/messages/forward`
Body = `ForwardMessagesDto` (`forward-messages.dto.ts`):

| Field | Notes |
| --- | --- |
| `messagesIds` | **required, min 1** — ids of messages to forward. |
| `toList` | **required, min 1**; plus optional `ccList`/`bccList`. |
| `isEmail` | `true` for email forwards. |
| `subject` | typically `Fwd: …`. |
| `text` | optional forwarding note (sent as an extra trailing message if non-empty). |
| `attachments` | optional extra attachments for the note message. |
| `topicId`/`threadId` | target conversation (omit to start a new one). |

Server (`forwardMessage`) loads the original messages, builds quoted history HTML (`unsend__email_history` / `unsend__quote` blockquotes), combines original attachments into the outbound email, and sends. If a forwarding `text`/attachment is present it is appended as a separate reply message. Returns the resulting thread.

> There is also a `ForwardEmailDto` (`forward-email.dto.ts`: `threadId` required, `toList`, `ccList`, `bccList`, `text`) — a leaner forward shape. The wired controller route consumes `ForwardMessagesDto`; treat `ForwardEmailDto` as a secondary/legacy shape and confirm against the generated OpenAPI before using it.

### 5.3 Composer HTML safety
The HTML the user composes is sent verbatim and stored/relayed. Sanitize the composer output (DOMPurify, allow-list for a rich-text editor) before POSTing so the web client never originates unsafe markup. Inbound rendering safety is independent (§4).

---

## 6. Attachments

### 6.1 Multipart upload (large files) — `attachment` controller (`/api/v1/attachment/*`)
This is the S3 multipart flow used by the RN app (`frontend/src/Services/attachment.ts`); endpoints from `backend/src/aws/aws.controller.ts`:

1. **Start** — `POST /attachment/start-upload`
   Body `StartUploadDto`: `{ filename, contentType }`. Returns `{ uploadId }` (S3 multipart upload id). On failure returns `{ status:'Failed', error }` (HTTP 200, **inspect the body** — errors aren't surfaced as non-2xx).
2. **Per-part presigned URL** — `GET /attachment/get-upload-url/filename/:filename/part-number/:partNumber/upload-id/:uploadId`
   Returns `{ url }` — a presigned **S3 `UploadPart` PUT URL** (1-based `partNumber`, expires in 1h).
3. **PUT each chunk directly to S3** — `PUT <url>` with the raw chunk bytes.
   **Capture the `ETag` response header for every part** — you need `{ ETag, PartNumber }` to complete. (S3 requires min 5 MB per part except the last.)
4. **Complete** — `POST /attachment/complete-upload`
   Body `CompleteUploadDto`: `{ filename, uploadId, parts: [{ ETag, PartNumber }, ...] }`. Returns `{ data }` (S3 `CompleteMultipartUpload` result incl. final object `Location`/`Key`). Again, failures come back as `{ status:'Failed', error }` at HTTP 200.

After completion, build an `AttachmentDto` (`{ url, title, type, size, ... }`) from the resulting object URL and include it in the `attachments[]` of the `POST /messages` (or forward) body.

> Web specifics: read the `File` with the Blob/`File.slice()` API to chunk; `PUT` chunks with `fetch`. Because chunk PUTs go straight to S3 (presigned, no auth header), they bypass the BFF — do them client-side. The `attachment` controller routes themselves require the Bearer JWT, so route those three calls through the typed client/BFF.

### 6.2 Single-shot upload URL — `GET /api/v1/messages/attachment/:filename`
Despite the name, this returns an **upload** link, not a download: `{ url, filename }` where `url` is a presigned **PUT** URL and `filename` is the generated S3 key (`messages.controller.ts > getUploadSignedUrl`, RN constant `getSignedURLForUploadAttachment`). Use it for small files: GET the URL, `PUT` the whole file to S3, then attach `{ url, filename }`. It does **not** stream file bytes back.

> Correction to common assumption: there is **no GET endpoint that downloads attachment bytes**. Download = fetch the attachment's stored `url` directly (it points at the S3/CDN object). The RN client simply downloads from `attachment.url` (`frontend/src/Elements/Message/Utils/index.tsx > downloadFile`). On web, link to `attachment.url` (`download` attr) or `fetch()` → `Blob` → object URL. If objects are private, you'd need a presigned GET — not currently exposed, so assume public/CDN URLs and verify against your bucket config.

---

## 7. Sender favicons — `GET /api/v1/favicon/:email`

`backend/src/favicon/favicon.controller.ts` → `FaviconService.getFavicon`. Returns a **favicon URL string** (or `null`) for the email's domain: cached in Mongo by domain; on miss it fetches from the external favicon API, uploads to S3, caches, and returns the S3 URL.

- Route is under the global prefix → **`/api/v1/favicon/:email`**.
- The controller has **no `@UseGuards`** — it is not JWT-protected at the controller level (verify whether a global guard applies; if not, it's effectively public). Confirm against the generated OpenAPI / a live call before relying on unauthenticated access.
- Threads already carry a `favicon` field in their metadata; prefer that when present and only call this endpoint to backfill a missing sender avatar (e.g. promotional/email rows). Cache results in the Query cache keyed by domain to avoid refetching.

---

## 8. Implementation checklist (web)
- Mailbox tabs → one `useQuery` per `FetchThreadsFilterEnum` value against `/threads/filter/:filter/page/:page/size/:size`; virtualize rows with `@tanstack/react-virtual`.
- Inbox renders pinned (`isPinned` tab) as a section above inbox (inbox excludes pinned).
- Open email → lazy `GET /messages/message/:id` for `html`; render through the §4 pipeline (DOMPurify → CSP `srcdoc` → no-script sandbox → remote-image gate → link rewrite). Mark seen via `PATCH /messages/thread/:id/seen` (+ `socketid` header).
- Compose/reply via `POST /messages` (`isEmail:true`, `refId`, `toList/ccList/bccList`, `subject`, sanitized `html`, `attachments`); forward via `POST /messages/forward`.
- Thread actions (spam/bookmark/pin/silent/delete) via `PUT /threads/update` — see below.
- Attachments via the multipart flow (§6.1) or single-shot URL (§6.2); downloads straight from `attachment.url`.
- Favicons via thread `favicon`, backfilled from `GET /favicon/:email`.
- Socket events (new message, seen, delete) write into the Query cache — see `10-state-and-realtime.md`.

### Thread actions reference — `PUT /api/v1/threads/update`
Body = `UpdateThreadsDto` (`update-thread.dto.ts`): `{ threadIds: string[] (min 1), updateType: ThreadUpdateType, update: boolean }`.

| Action | `updateType` value |
| --- | --- |
| Pin / Unpin | `isPinned` (server also sets/clears `pinDate`) |
| Bookmark | `isBookmarked` |
| Silent (mute) | `isSilent` |
| Spam / Not-spam | `isSpam` (also maintains the user's `spamSenderAddresses`) |
| Promotional | `isPromotional` |
| Delete | `isDeleted` |

Semantics (`threads.service.ts > updateThreads`):
- Marking **spam** or **deleted** also resets `isPinned`, `isBookmarked`, `pinDate` on those threads.
- **Delete is two-stage**: `update:true` on a thread that is *not yet* `isDeleted` → soft-delete (move to Trash). `update:true` on a thread *already* `isDeleted` → **permanent delete** (removes thread + its messages; if a `topicId` has no remaining threads, the chat is removed too) and emits a `delete` socket event to the user's room (quirk #1: the event name equals the room name = the user id).
- Pass header `socketid`/`x-socket-id` so the originating tab isn't echoed.
- Optimistically update the Query cache, then reconcile from the socket `delete`/update events.

Cross-references: `03-websocket-events.md` (socket events feeding the cache, `socketid` header echo-suppression), `05-data-models.md` (Thread/Message/Chat/Address/Attachment entity shapes).
