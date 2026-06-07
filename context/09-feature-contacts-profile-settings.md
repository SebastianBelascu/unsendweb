# 09 — Contacts, Profile & Settings

Feature spec for the contacts address book, the user profile/account screens, privacy & presence settings, password/phone changes, and device/session management in **unsendnext**, mapped to the unchanged backend.

> Conventions used throughout: all REST paths below are shown **relative to the global prefix `/api/v1`** (set in `backend/src/main.ts:45` via `app.setGlobalPrefix('/api/v1')`). All endpoints require `Authorization: Bearer <JWT>` (`JWT-auth`) unless noted. The legacy RN client stores templates as `/v1/...` (e.g. `frontend/src/Constants/api.ts`); the auto-generated openapi-fetch client already encodes the full prefix, so prefer it over hardcoding paths. See `04-auth-sessions-deviceid.md` for auth/BFF and `03-websocket-events.md` for sockets/presence.

---

## 1. Contacts (address book)

### 1.1 Data model recap

A `Contact` row (`backend/src/entities/contacts.schema.ts`) is **per-owner**: `{ userId, name, address, phone }`. It is a denormalized snapshot of a platform `User`:

- `address` = `${username}@${DOMAIN}` (the username-derived Unsend mail address — `User` has **no** separate email field; see `contacts.service.ts` comments and `05-data-models.md`).
- `name` = `${firstName} ${lastName}` captured at creation time. It is refreshed across **all** owners when that user edits their name, via the `user.profile.updated` event (`ContactsService.handleUserProfileUpdated`, `contacts.service.ts:291`). `username`/`address` are stable because username is not editable.
- `phone` is denormalized onto the row so phone search needs no `User` join on the hot path.

A `PendingContact` (`backend/src/entities/pending-contacts.schema.ts`) is `{ addedByUserId, phone, createdAt }` — a phone the owner tried to add that has **no** matching platform user yet. When that phone later registers, the backend auto-promotes it to a real `Contact` and deletes the pending row (`ContactsService.handleUserRegistered`, `contacts.service.ts:308`).

### 1.2 Contacts endpoints (`backend/src/contacts/contacts.controller.ts`)

| Method | Path | Body / Params | Returns | Notes |
|---|---|---|---|---|
| POST | `/contacts` | `{ phones: string[] }` (`CreateContactDto`) | `{ contacts: ContactRow[], pendingPhones: string[] }` | Matches phones to users; matched → new `Contact` rows, unmatched → `PendingContact` rows. Idempotent (skips existing). |
| POST | `/contacts/import` | `{ contacts: ImportedContactDto[] }` | `{ matches: ImportContactMatchDto[] }` | Bulk device-contact match. **See 1.4** — limited value on web. |
| GET | `/contacts` | — | `{ contacts: { name, address, phone }[] }` | Full address book for the current user. |
| GET | `/contacts/search/:search` | `search` (path) | `{ name, address, phone }[]` (bare array) | Searches the owner's contacts by name/address prefix and phone substring. |
| GET | `/contacts/pending` | — | `{ pendingContacts: { phone, createdAt }[] }` | Owner's unmatched phones awaiting signup. |
| GET | `/contacts/address/:address` | `address` (path) | `{ name, address }` or `404` | Resolve any platform user by username/local-part. **Not scoped to the owner's contacts.** |
| GET | `/contacts/byPhone/:phone` | `phone` (path) | `{ name, address, phone }` or `404` | Resolve any platform user by **full** phone (≥7 digits). Discovery, not address book. |

Response-shape caveats (the generated OpenAPI types are loose here):

- `GET /contacts`, `POST /contacts`, and `GET /contacts/search/:search` are typed `[ContactResponseDto]`/`ContactResponseDto` in Swagger, but the **runtime shapes differ**: list/create wrap in `{ contacts: [...] }` and `{ contacts, pendingPhones }` respectively, while `search` returns a **bare array** `{ name, address, phone }[]`. `ContactResponseDto` advertises an `_id`, but the controller/service `.select(... _id: 0)` so **`_id` is not actually returned**. Confirm against `frontend/src/Services/contact.ts` (`ReponseSearchUserContact = { contacts: Contact[] }`, `ResponseFetchLocalContactByEmail = Contact`).
- `GET /contacts/address/:address` and `/contacts/byPhone/:phone` return a plain `{ name, address[, phone] }` object — **not** a `Contact`-row shape and with no `_id`.

### 1.3 Search semantics (matters for the web search box)

`ContactsService.searchContacts` (`contacts.service.ts:18`):

- Builds an `$or` over **address prefix** (`^query`), **name prefix** (`^query`), and — only when the query normalizes to **≥ 4 digits** — a **phone substring** match (no anchor). So `4567` matches stored `+123456789`.
- Use debounced queries; the RN service passes an axios `CancelToken` per keystroke (`frontend/src/Services/contact.ts`). On web, cancel the in-flight request via `AbortController`/TanStack Query's `signal` to avoid out-of-order results.

Discovery (compose "to" field / "start chat with a stranger") uses the two **lookup** endpoints instead of search:

- `GET /contacts/byPhone/:phone` — `fetchUserByPhone` requires **≥ 7 digits** and does **digit-suffix equality** against E.164 stored phones (`contacts.service.ts:372`). Returns `null`/`404` below 7 digits so fragments don't surface strangers.
- `GET /contacts/address/:address` — `fetchUserContactByAddress` strips any `@…` and looks up by `username` (`contacts.service.ts:381`).
- `GET /users/user/:userData` (Users controller) is the broadest single-user resolver (username **or** phone) and returns a `userId`; see §2.1.

### 1.4 Web parity note — contact import is largely N/A

`POST /contacts` and `POST /contacts/import` were designed for **native** device-contact-book access (iOS `CNContactStore`; `importContacts` even round-trips `localId` so iOS can attach `INSendMessageIntent`/`INStartCallIntent` to a `CNContact`). The web client has **no system address book**, so:

- Treat `/contacts/import` as **out of scope** for the initial web build (no source of `ImportedContactDto[]`).
- `POST /contacts` can still be used if the web app ever lets a user paste/enter phone numbers manually, but the primary web flow for "add someone" is discovery via `byPhone`/`address`/`users/user` followed by simply starting a thread.

`importContacts` matching logic (for reference): matches a device contact to a `User` by `User.phone` **or** by any email whose suffix is `@${DOMAIN}` (treated as a username). Non-Unsend emails (gmail/icloud/outlook) cannot resolve and are silently dropped. It also upserts the matched rows into the owner's `Contact` collection.

---

## 2. User profile & account

### 2.1 Lookup / search other users (`backend/src/users/users.controller.ts`)

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/users/user/:userData` | `{ status: 'OK', data: { userId, username, phone, name } }` or `404` | Single user by **username or phone** (`fetchByUsernameOrPhone`). RN alias `checkExistingUser`. |
| GET | `/users/search/:userData` | array (loosely typed) | Fuzzy search by username/name (`fetchUsersByUsernameOrName`). No DTO — **OpenAPI returns `any` here; confirm shape against RN usage**. |

`/users/admin/*` and `/users/avatar-changes` are admin/sync utilities; `avatar-changes` is covered in §2.4.

### 2.2 Update my profile — `PATCH /users/me`

Body `UpdateProfileDto` (`backend/src/users/dtos/update-profile.dto.ts`) — all fields optional, only sent fields are applied (`$set`-style):

| Field | Rules |
|---|---|
| `firstName` | string, non-empty after trim, ≤ 60 |
| `lastName` | string, ≤ 60 |
| `birthDate` | ISO 8601 date string (`YYYY-MM-DD` or full datetime) |
| `gender` | string, ≤ 40 |

- **`phone` is intentionally NOT accepted here** — it has its own SMS-verified flow (§2.5). `username` is not editable.
- Returns `UpdateProfileResponseDto`: `{ userId, firstName, lastName, username, phone, gender?, birthDate?, avatarVersion? }`.
- **Echo-suppression header**: the controller reads `socketid` (or `x-socket-id`) from request headers and passes it as `excludedSocketId` so the originating socket doesn't get its own broadcast. The web client should send its current socket id in this header on `PATCH /users/me` (and on phone-verify and avatar-version) to avoid a self-echo. See `users.controller.ts:140` and `03-websocket-events.md`.
- **Side effects** (`users.service.ts:268`): emits `user.profile.updated` (drives `Contact.name` fan-out across all owners when the name changed) and broadcasts socket event `user-profile-updated` (`SocketEvent.userProfileUpdated`) to other clients with `{ userId, username, firstName, lastName, phone, birthDate, gender }`. **Web must listen for `user-profile-updated`** and patch its TanStack Query cache for inbox rows, contact pickers, and open thread headers. See `03-websocket-events.md` / `05-data-models.md`.

### 2.3 Avatar upload (two-step + version bump)

There is no single "upload avatar" endpoint. Avatars live in object storage keyed by **username** (`${storageUrl}${username}.jpeg`, see `frontend/src/Utils/avatar/url.ts`). The flow:

1. **Get a signed PUT URL** — `GET /settings/profileImage/:filename` (`backend/src/settings/settings.controller.ts`). Returns `{ url, filename }` where `url` is an S3 presigned upload link scoped to the `profileImages` folder for the caller's username (`AwsService.generateUploadLink(filename, 'profileImages', username)`). RN alias: `getSignedForUploadProfileImage`.
2. **PUT the image bytes** directly to `url` (no Bearer; it's a presigned S3 URL). Web: read the `File` from an `<input type="file">`, optionally client-crop/resize to a square JPEG, then `fetch(url, { method: 'PUT', body: blob })`.
3. **Bump the avatar version** — `POST /users/update-avatar` with body `UpdateAvatarVersionDto` `{ username }`. Backend sets `avatarVersion = Date.now()` and `avatarUpdatedAt = now` (`users.service.ts:481`), then broadcasts `user-avatar-updated` (`SocketEvent.userAvatarUpdated`) `{ username, version }`. Send the `socketid`/`x-socket-id` header here too for echo-suppression.

> The storage URL is unversioned; cache-busting is done by appending `?v=<avatarVersion>` (see `getAvatarUrl`). The web client should keep a `username -> avatarVersion` map (seeded from profile/contacts responses and from `avatar-changes`) and rebuild `<img src>` when the version changes. On `user-avatar-updated` socket events, update that map.

### 2.4 Avatar version sync

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/users/avatar-changes?since=<ms-epoch>` | `{ changes: { username, version, updatedAt }[] }` | Users whose `avatarUpdatedAt > since`. `since` is **required** and must be a numeric ms timestamp (else `400`). |

Use this to refresh stale avatar cache-busting versions on app focus/reconnect, then rely on the `user-avatar-updated` socket event for live updates. The RN client also references `/v1/users/:username/avatar-version` and `/v1/users/avatar-versions/bulk` (`frontend/src/Services/avatarSync.ts`), but **those routes are not present in `users.controller.ts`** in this tree — do not depend on them; treat `avatar-changes` as the supported sync path and **confirm the bulk routes are 404 before wiring them**.

### 2.5 Change phone number (SMS-verified, two-step)

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/users/me/phone/send-code` | `{ phone }` (`StartPhoneChangeDto`, E.164) | `{ success, message }` | Validates the new number isn't taken, then sends a Twilio code. Does **not** apply the change. |
| POST | `/users/me/phone/verify` | `{ phone, code }` (`VerifyPhoneChangeDto`, code 4–8 chars) | `UpdateProfileResponseDto` | Confirms the code (`status === 'approved'`), re-checks uniqueness, swaps `user.phone`, broadcasts `user-profile-updated`. Send `socketid` header. |

`phone` validation regex and rules in `backend/src/users/dtos/change-phone.dto.ts`; flow in `users.service.ts:380` (`requestPhoneChange`) and `:413` (`confirmPhoneChange`). Errors surface as `400` with messages like `Phone number already in use`, `New phone number is the same as the current one`, `Invalid verification code`.

### 2.6 Change password

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| PATCH | `/auth/change-password` | `{ oldPassword, newPassword }` (`ChangePasswordDto`) | `{ success, message }` | Verifies `oldPassword`, requires `newPassword` ≥ 8 chars. `401` `Incorrect password` if old is wrong. |

Defined on the **Auth** controller (`backend/src/users/auth.controller.ts:599`), not Users. RN alias: `changePassword` (`frontend/src/Constants/api.ts:23`). This is the in-app change; the unauthenticated reset flow (`/auth/request-password-reset` → `/auth/verify-reset-password-code` → `/auth/reset-password`) belongs to **`04-auth-sessions-deviceid.md`** — cross-link, don't duplicate.

---

## 3. Privacy & presence settings

### 3.1 Endpoint — `PATCH /users/me/privacy`

`backend/src/users/privacy.controller.ts`. Body `UpdatePrivacyDto` (`update-privacy.dto.ts`), both optional booleans:

| Field | Default | Meaning |
|---|---|---|
| `showOnlineStatus` | `true` | Broadcast & receive online/offline presence. |
| `showLastSeen` | `true` | Expose your last-seen timestamp to others. |

Returns `{ showOnlineStatus, showLastSeen }`.

### 3.2 Symmetric-privacy semantics (must implement correctly in the UI)

Presence is **symmetric**: a user with `showOnlineStatus=false` neither **broadcasts** their status nor **receives** anyone else's. Enforced server-side in `PresenceController` and the sockets gateway (`presence.controller.ts:9` header comment; gateway `handlePresenceSubscribe`). Concretely (`presence.controller.ts`):

- Requester with `showOnlineStatus=false` → presence checks return **empty** (`{ online: [], lastSeen: {} }`).
- Targets with `showOnlineStatus=false` are excluded entirely from results.
- Targets with `showLastSeen=false` are absent from `lastSeen` but **still appear in `online`** when connected.

UI implication: when the user turns **off** online status, the web app should stop rendering presence dots and last-seen subtitles for **everyone** (not just hide their own), because the backend will return nothing. See **`03-websocket-events.md` (sockets/presence)** for `POST /users/presence` (bulk seed: `{ usernames: string[] }` → `{ online: string[], lastSeen: Record<username, ISO8601> }`) and the live `presence:online` / `presence:offline` events. Do not duplicate that contract here.

---

## 4. Device & session management

Web has no native push, but the device registry is still the **session list** (each login `deviceId` is a device row), and it powers "log out other devices". Controller: `backend/src/users/user-devices.controller.ts` (tag `Devices`, base `/devices`). All routes use `JwtWithDeviceGuard`; admin-only routes add `RolesGuard`.

### 4.1 Endpoints

| Method | Path | Body / Params | Returns | Web relevance |
|---|---|---|---|---|
| GET | `/devices` | — | `{ success, devices: DeviceRow[] }` | **Sessions list.** Each row has `isCurrent` flag. |
| POST | `/devices` | `CreateDeviceDto` | `{ success, message }` | Register/upsert current device. **See 4.3** for web payload. |
| DELETE | `/devices/device/:deviceId` | `deviceId` | `{ success, message }` | Delete a specific device (legacy path). |
| DELETE | `/devices/:deviceId` | `deviceId` | `{ success, message }` | Delete by id (owner or admin); emits `session:invalidate`. |
| DELETE | `/devices/my-other-devices` | — | `{ success, message, count }` | **"Log out all other sessions."** Keeps current, emits `session:invalidate` to each removed device. |
| PATCH | `/devices/badge-reset/device/:deviceId` | `deviceId` | `{ success, message }` | Reset unread badge counter for a device. |
| GET | `/devices/badge-count/device/:deviceId` | `deviceId` | `{ success, badgeCount }` | Read a device's badge counter. |
| PATCH | `/devices/activity/device/:deviceId` | `deviceId` | `{ success, message }` | Heartbeat — bumps `lastActiveAt`. |
| PUT | `/devices/device/:deviceId/voip-token` | `{ voipToken }` | `{ success, message }` | **iOS VoIP only — N/A on web.** |
| DELETE | `/devices/user/:userId/all` | `userId` | `{ success, message, count }` | **Admin only** — wipe all of a user's devices. |

`DeviceRow` (from `listMyDevices`, `user-devices.controller.ts:50`): `{ deviceId, deviceName, deviceType, deviceOs, deviceOsVersion, deviceAppVersion, createdAt, lastActiveAt, isCurrent }`.

RN path aliases (note `device/` segment differs from the RN constant set, which omits a `list` route): `registerNewDevice`, `deleteRegisteredDevice`, `resetDeviceNotificationBadge`, `getDeviceBadgeCount`, `updateDeviceActivity` (`frontend/src/Constants/api.ts:5`); service wrappers in `frontend/src/Services/device.ts`. There is **no RN wrapper for `GET /devices` or `DELETE /devices/my-other-devices`** — those are newer; the web client uses them directly via the generated client.

### 4.2 `session:invalidate` socket event

Deleting a device (`/devices/:deviceId`, `/devices/my-other-devices`, admin `…/all`) emits `SocketEvent.sessionInvalidate` = **`session:invalidate`** (`backend/src/types/socketEvent.ts:10`) to the affected user's room with `{ deviceId?, reason }` where `reason ∈ { 'device_deleted', 'other_sessions', 'all_sessions' }`. The web app **must** listen for `session:invalidate`: if the payload's `deviceId` matches the current session (or `reason` implies all/others and this isn't the keeper), clear tokens (call the BFF logout) and route to login. System-health also emits this event (`system-health.service.ts`). See `03-websocket-events.md`.

### 4.3 Registering the web "device"

`CreateDeviceDto` (`backend/src/users/dtos/createDevice.dto.ts`) — required: `deviceId`, `deviceToken`; optional: `deviceName`, `deviceType`, `deviceOs`, `deviceOsVersion`, `deviceAppVersion`, `voipToken`, `pushPlatform ∈ {'apns','fcm'}`. Upsert is **sparse** — omitted fields are preserved (`$set` only what you send); explicit `null` clears.

Web guidance:

- Generate a stable `deviceId` (UUID persisted in `localStorage`) so a browser shows as one session across reloads. This `deviceId` should also be the one sent at `/auth/login` (the login flow creates a minimal device session up front — `auth.controller.ts:332`).
- `deviceToken` is required by the DTO. With no push subscription, send a placeholder/web-push token; **without web push, badge/notification fields are inert** — leave `voipToken` and `pushPlatform` unset.
- Populate `deviceName`/`deviceType`/`deviceOs`/`deviceAppVersion` from the user agent so the sessions list is human-readable (e.g. `deviceType: 'web'`, `deviceOs: 'Chrome 124 / macOS'`).
- Badge endpoints (`badge-reset`, `badge-count`) are only meaningful with push; on web they're optional no-ops unless web push is added later.

> Reminder (out of scope, per product decision): **incoming calls/notifications only work while a tab is open** — there is no VoIP/background push on web. That would require a backend change. See `08-feature-calls.md`.

---

## 5. Cross-links

- **`04-auth-sessions-deviceid.md` — Auth & BFF**: Bearer/JWT, login `deviceId`, `socket-token` route, the unauthenticated password-reset trio.
- **`03-websocket-events.md` — Sockets & presence**: `POST /users/presence` seed, `presence:online`/`presence:offline`, `user-profile-updated`, `user-avatar-updated`, `session:invalidate` handling, and the `socketid` echo-suppression header.
- **`05-data-models.md` — Data models**: `User`, `Contact`, `PendingContact` schemas; the `username@DOMAIN` address derivation and avatar storage keying.
