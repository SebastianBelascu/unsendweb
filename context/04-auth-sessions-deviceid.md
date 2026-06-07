# 04 — Auth, Sessions & deviceId

Purpose: the complete authentication contract for `unsendnext` — registration, login, token refresh, password reset/change, the `deviceId` requirement, device registration, session invalidation, and the recommended BFF cookie + socket-token strategy. Grounded in the existing NestJS backend and the React Native (RN) porting reference.

> The backend is **immutable** for this project. Everything below describes the API as it exists; the web client must adapt to it. See `02-backend-rest-api.md` for the general REST/OpenAPI client setup and `03-websocket-events.md` for the socket transport.

---

## 1. Quick facts

| Thing | Value | Source |
|---|---|---|
| REST base | `/api/v1` (global prefix) | `backend/src/main.ts` (`setGlobalPrefix('/api/v1')`) |
| Auth scheme | `Authorization: Bearer <accessToken>` (JWT) | `backend/src/users/jwt.strategy.ts` (`fromAuthHeaderAsBearerToken`) |
| JWT secret | `JWT_SECRET` (HS256, single secret for access **and** refresh) | `jwt.strategy.ts`, `refresh-token.service.ts` |
| Access token TTL | `7d` | `backend/src/users/refresh-token.service.ts` |
| Refresh token TTL | `JWT_REFRESH_EXPIRE` env, default `365d` | `refresh-token.service.ts` |
| JWT payload | `{ username, sub: userId, role, deviceId? }` | `backend/src/users/jwt-payload.interface.ts`, `refresh-token.service.ts` |
| CORS | `origin: '*'`, `credentials: true` | `main.ts` |
| OpenAPI JSON | `/docs-json` (HTTP basic-auth protected) | `main.ts` |

All auth endpoints live under the `auth` controller (`backend/src/users/auth.controller.ts`), prefix `auth`, so full paths are `/api/v1/auth/...`. Device endpoints live under `devices` (`/api/v1/devices/...`).

> **RN path quirk.** The RN client's `Constants/api.ts` writes paths as `/v1/auth/...` (no `/api`) and relies on a base URL that already includes `/api`. When generating the typed client from `/docs-json` for web, trust the OpenAPI paths, not the RN string constants.

---

## 2. Endpoint inventory (auth)

All paths below are relative to `/api/v1`. Source: `backend/src/users/auth.controller.ts`.

| Method | Path | Body DTO | Auth | Purpose |
|---|---|---|---|---|
| POST | `/auth/register` | `RegisterDto` | none | Create an **unverified** user (validated against invitation code) |
| POST | `/auth/send-code` | `SendCodeDto` `{ phone }` | none | Send Twilio OTP to a phone (user must already exist in DB) |
| POST | `/auth/resend-verification-code` | `ResendVerificationCodeDto` `{ username }` | none | Resend OTP, looked up by username → phone |
| POST | `/auth/verify` | `VerifyCodeDto` `{ phone, code, password? }` | none | Verify OTP; on success creates the WildDuck mailbox + marks user verified |
| POST | `/auth/login` | `LoginDto` `{ username, password, deviceId }` | none | Returns `{ success, user, accessToken, refreshToken }`; creates a minimal device session |
| POST | `/auth/refresh-token` | `{ refreshToken, deviceId? }` | none | Returns `{ success, accessToken, refreshToken }` (rotates both) |
| POST | `/auth/login-admin` | `LoginDto` | none | Admin login (no `deviceId` required). Not relevant for the web client. |
| POST | `/auth/request-password-reset` | `ResetPasswordReqDto` `{ userData }` | none | Send OTP for reset; returns the user's basic info |
| POST | `/auth/verify-reset-password-code` | `VerifyCodeDto` `{ phone, code }` | none | Verify reset OTP → returns a short-lived (`1h`) reset `token` |
| PATCH | `/auth/reset-password` | `ResetPasswordDto` `{ password, token }` | none (token in body) | Set new password using the reset token |
| PATCH | `/auth/change-password` | `ChangePasswordDto` `{ oldPassword, newPassword }` | **Bearer (`AuthGuard()`)** | Change password while logged in |
| POST | `/auth/create-user` | `CreateSystemUserDto` | none | System/dummy account creation — **not for web** |

> **OpenAPI typing caveat.** `register`, `verify`, `login`, etc. return plain object literals, not typed DTOs (only `login`/`login-admin` are annotated with `LoginResponseDto`). The generated client will type most responses loosely (`any`/empty objects). Confirm exact shapes against `frontend/src/Services/auth.ts` and `frontend/src/Types/auth/response.ts` while porting. `refresh-token` and `change-password` are **not** typed in Swagger.

---

## 3. Registration flow (multi-step OTP)

The phone-number OTP flow is **three separate calls**, and the WildDuck mailbox is created only at verification time.

```
register ──> send-code ──> verify ──> (user verified + WildDuck mailbox) ──> login
```

### 3.1 `POST /auth/register` — create unverified user
`RegisterDto` (`backend/src/users/dtos/register.dto.ts`):

| Field | Rules |
|---|---|
| `firstName` | required |
| `lastName` | (string; no `@IsNotEmpty`) |
| `gender` | required |
| `birthDate` | required (string, e.g. `"01-01-2000"`) |
| `username` | required; min/max length + pattern from `username.constants.ts`; lowercased server-side |
| `phone` | required; matched against a phone regex |
| `password` | required; **min 8 chars**; hashed (bcrypt) server-side |
| `invitationCode` | required; must exist, be unused, and not expired |

Behavior (`auth.controller.ts#register`):
- Validates username/phone uniqueness + invitation code (`AuthService.validateRegisteringUser`).
- Hashes password, builds an `IUser`, validates + consumes the invitation code, persists the user as **unverified** (`verified: false`).
- Tracks user location from `req.ip` + `user-agent` (transparent to the client).
- Returns `{ success: true, message: 'User created successfully' }`.

> Invitation codes are **mandatory** for normal registration. The web sign-up form must collect one. See the `InvitationCodesService` flow if you need the error strings (`Invalid invitation code`, `Invitation code has already been used`, `Invitation code has expired`).

### 3.2 `POST /auth/send-code` — send OTP
`SendCodeDto { phone }`. Delegates to `AuthService.sendVerificationCode(phone)` → `TwilioService.sendVerificationCode`. The user **must already exist** (404-style `Phone number not found` otherwise).

**OTP rate limiting** (`auth.service.ts#sendVerificationCode`):
- `MAX_RETRIES = 3`, `BLOCK_DURATION_MINUTES = 30`.
- On every send, `otpRetries` increments; at 3 the user is blocked for 30 minutes (tracked via `otpBlockExpirationDate`).
- Returns `{ success, message }`. `success: false` with a wait message when blocked. The 3rd attempt returns `"This is your last attempt"`.

`POST /auth/resend-verification-code` (`{ username }`) resolves the username to a phone and calls the same path.

### 3.3 `POST /auth/verify` — verify OTP + provision mailbox
`VerifyCodeDto { phone, code, password? }`. The `password` field is optional and unused for plain verification.

Behavior (`auth.controller.ts#verify`):
1. `AuthService.verifyCode(phone, code)` → `TwilioService.checkVerificationCode`. Approved → returns the user; otherwise throws `Invalid Code`.
   - **Twilio `20404`** (verification check no longer exists — code expired, ~10 min TTL, or already consumed) is downgraded to a one-line warn and surfaced to the client as `Invalid Code`. Treat an `Invalid Code` response as "expired or wrong; re-send".
2. Creates the WildDuck mailbox: `WildduckService.createNewUser(username, password, "First Last")`.
3. Updates the user: `verified: true`, stores `wildduck_id`.
4. Emits `user.registered` (resolves pending contacts) and `system-message` (welcome message).
5. Returns `{ success: true, message: 'User Verified' }`.

After verification the user can log in.

---

## 4. Login

`POST /auth/login` — `LoginDto { username, password, deviceId }` (`backend/src/users/dtos/login.dto.ts`). **All three are `@IsNotEmpty`; `deviceId` is required.**

Behavior (`auth.controller.ts#login`):
1. `username` is normalized: trimmed, lowercased, and if it contains `@` only the local part is kept (`AuthService.normalizeUserName`). So users may log in with `name` or `name@domain`.
2. Looks up by username **or** phone (`fetchByUsernameOrPhone`).
3. Rejects when: user not found, `!verified` (returns `user` stub + `"User isn't verified"`), `blocked` (`"Your account has been blocked"`), or `loginAttempts >= 3` (sets `blocked: true`, returns `"Your account has been locked"`).
4. **Login-attempt lockout:** each wrong password does `loginAttempts += 1`. At the 3rd-from-last attempt the message is `"One last attempt before we lock you down!"`; on the next failed login the `>= 3` check locks the account. A successful login resets `loginAttempts: 0`.
5. **Creates a minimal device session BEFORE issuing tokens** (`UserDevicesService.createMinimalDeviceSession(userId, deviceId)`), to avoid a race where a refresh runs before the device row exists. Failure here is logged but non-fatal — the device gets fully registered later via `POST /devices`.
6. Issues tokens via `RefreshTokenService.generateTokens(user, deviceId)` — the `deviceId` is embedded in both tokens.

### 4.1 Login response (`LoginResponseDto`)
```jsonc
{
  "success": true,
  "user": { "userId", "firstName", "lastName", "username", "phone", "gender", "birthDate" },
  "accessToken": "<JWT, 7d>",
  "refreshToken": "<JWT, 365d default>"
}
```
> The Swagger `UserDataDto` only documents `userId/firstName/lastName/username/phone`, but the controller also returns `gender` and `birthDate` (and `role` for admin login). Treat the documented user shape as a subset; the RN `User` type (`frontend/src/Types/auth`) is the fuller reference.

Error responses are `BadRequestException` bodies shaped `{ statusCode, message, error, user? }`. The web client should branch on `message`/`statusCode` (the `verified === false` case includes a `user` stub so you can route to the OTP screen).

---

## 5. Refresh-token flow

`POST /auth/refresh-token` — body `{ refreshToken, deviceId? }`.

Behavior (`refresh-token.service.ts#refreshAccessToken`):
1. `jwt.verify(refreshToken, JWT_SECRET)` (same secret as access tokens). On any verify error → returns `null` → controller throws **400** `{ statusCode: 401, message: 'Invalid or expired refresh token' }`.
2. Re-loads the user by `sub`; missing → `null`.
3. `deviceId` precedence: the **request `deviceId` wins**, else falls back to `payload.deviceId` embedded in the refresh token.
4. For non-admin users: if there's no resolved `deviceId`, or the device row no longer exists for that user (`Device { userId, deviceId }`), refresh **fails** (`null`) → session invalidated. Admins skip device validation.
5. On success issues **both** a fresh access and refresh token (token rotation) with the same `deviceId`.

Response: `{ success: true, accessToken, refreshToken }`.

Key implications for web:
- **Always send the `deviceId`** on refresh. Even though the token embeds it, sending it explicitly mirrors RN behavior and avoids surprises if the embedded value is missing.
- A deleted/invalidated device makes refresh fail permanently → the client must log the user out and clear cookies. (Devices are deleted by "log out other sessions", admin actions, or stale-device cleanup — see §8.)
- Refresh requires no `Authorization` header; it only needs the refresh token in the body.

> **No server-side refresh-token store / revocation list.** Refresh tokens are stateless JWTs validated purely by signature + device existence. Revocation == deleting the device row. There is no rotation-reuse detection. (`refresh-token.service.ts` has an unused `isTokenExpiredButValid` helper; ignore it for the client.)

---

## 6. Password reset & change

### 6.1 Reset (logged out)
```
request-password-reset ──> verify-reset-password-code ──> reset-password
```
1. `POST /auth/request-password-reset` — `{ userData }` (phone **or** email; normalized via `normalizeUserName`). Looks up the user, sends an OTP (same Twilio rate limits as §3.2). On success returns `{ userId, firstName, lastName, username, phone }`.
2. `POST /auth/verify-reset-password-code` — `VerifyCodeDto { phone, code }`. On approval returns a **short-lived (`1h`) JWT reset `token`** (`AuthService.generateToken(user, '1h')`, payload `{ username, sub, role }`). The OTP is consumed here.
3. `PATCH /auth/reset-password` — `ResetPasswordDto { password, token }`. Verifies the reset token, hashes the new password, and **resets `loginAttempts: 0`, `otpRetries: 0`, `otpBlockExpirationDate: null`, `blocked: false`** (so a reset also unlocks a locked account). Invalid/expired token → 400 `Invalid token`.

### 6.2 Change (logged in)
`PATCH /auth/change-password` — `ChangePasswordDto { oldPassword, newPassword }` (new password min 8). Guarded by `AuthGuard()` (Bearer JWT — note this is the **plain** Passport guard, **not** `JwtWithDeviceGuard`, so it does not require a registered device). Verifies the old password, then updates. Wrong old password → 401 `Incorrect password`.

---

## 7. The `deviceId` requirement & `JwtWithDeviceGuard`

### 7.1 Why deviceId exists
Sessions are pinned to a device. The JWT carries `deviceId`, and most authenticated endpoints verify that a matching `Device { userId, deviceId }` row still exists. Deleting that row invalidates the session (used for "log out this/other devices").

### 7.2 Two guard tiers
- **`AuthGuard()` / `AuthGuard('jwt')` (plain JWT)** — used by `change-password` and many controllers. Runs `JwtStrategy.validate` which:
  - loads the user by `username` from the token,
  - **if `deviceId` is present in the token AND device validation is not skipped AND user is not admin**, asserts `deviceExists(userId, deviceId)`; missing → `401 Session has been invalidated`.
  - Attaches `{ ...user, deviceId }` to `req.user`.
- **`JwtWithDeviceGuard`** (`backend/src/users/guards/jwt-with-device.guard.ts`) — extends `AuthGuard('jwt')` and reads the `@SkipDeviceValidation()` metadata, setting `request.skipDeviceValidation` so the strategy can bypass the device check for specific handlers. **Used by all `devices` endpoints.**

> Net effect: device validation only bites when the token actually contains a `deviceId`. Tokens minted by `/auth/login` with a `deviceId` always do. So in practice, **once a web user logs in, every authenticated request requires the device row to exist** — register the device immediately after login (§7.4).

### 7.3 Bootstrapping the device (chicken-and-egg) — `@SkipDeviceValidation()`
`POST /devices` (register) is decorated with **`@SkipDeviceValidation()`** (`user-devices.controller.ts#upsertDevice`). That's what lets a freshly-logged-in client whose device row is still "Pending"/missing actually create it. The login endpoint already inserts a *minimal* row (`createMinimalDeviceSession`, type `unknown`, name `Pending`), so the gap is tiny, but the skip decorator guarantees `POST /devices` works regardless.

### 7.4 Generating a stable browser `deviceId` (web)
RN uses `react-native-device-info` `getUniqueId()` cached in `AsyncStorage` (`frontend/src/Utils/deviceId.ts`). The web has no hardware ID, so **generate and persist your own**:

- **Generate once:** `crypto.randomUUID()` (the backend treats `deviceId` as an opaque string — the RN example value is a 32-char hex, but any non-empty string is accepted).
- **Persist in `localStorage`** under a stable key (e.g. `unsendnext:deviceId`). `localStorage` survives reloads and is per-origin + per-browser-profile, which is the right "device" granularity for web. The same `deviceId` must be reused for login, refresh, device registration, and the socket session.
- It is **JS-readable on purpose** (unlike the auth tokens) — it is not a secret and must be sent in the `login`/`refresh` bodies and `POST /devices`.
- **Logout:** RN clears the stored deviceId on logout (`clearDeviceId`). For web, prefer to **keep** the deviceId stable across logout/login on the same browser so you don't accumulate orphan device rows. (Stale rows are cleaned up server-side after 30 days, and login dedupes same-`deviceId` rows older than 24h via `cleanupDuplicateDevices`.) Either choice works; document whichever you pick and be consistent.

A single shared `getDeviceId()` helper should be the only place that reads/writes the key. This mirrors `frontend/src/Utils/deviceId.ts`.

### 7.5 Registering the device — `POST /devices` for web
`POST /devices` body is `CreateDeviceDto` (`backend/src/users/dtos/createDevice.dto.ts`). The upsert key is `(userId, deviceId)`; updates use sparse `$set` so omitted fields are preserved.

| Field | Type | Required | Web value |
|---|---|---|---|
| `deviceId` | string | **yes** | your persisted browser UUID |
| `deviceToken` | string | **yes** (`@IsString`, and schema column is `required: true`) | see note ⚠️ |
| `voipToken` | string? | no | omit |
| `deviceName` | string? | no | e.g. `"Chrome on macOS"` (from UA) |
| `deviceType` | string? | no | **`"web"`** |
| `deviceOs` | string? | no | e.g. `"macOS"` |
| `deviceOsVersion` | string? | no | optional |
| `deviceAppVersion` | string? | no | your web build version |
| `pushPlatform` | `'apns' \| 'fcm'`? | no | **DO NOT SEND** ⚠️ |

⚠️ **`pushPlatform`:** the enum is **`apns | fcm` only** (`@IsIn(['apns','fcm'])`). Web has neither. **Omit the field entirely** — sending any other value (e.g. `"web"`) fails validation; sending `apns`/`fcm` would mis-route push attempts. Omitting it is correct (it is optional, no default).

⚠️ **`deviceToken` is declared required** but web has no native push token. The DTO marks it `@IsString()` (not `@IsOptional`), and the Mongoose schema column is `required: true`. Web clients have no real token to send, so:
- **Send a non-empty placeholder** (e.g. the same `deviceId`, or a constant like `"web"`) to satisfy validation. It will never be used for delivery (web isn't in the push-dispatch path; the dispatcher keys off `pushPlatform`/token heuristics and APNs/FCM tokens).
- This is loosely typed — **verify the exact requirement against the live `/docs-json` and against `frontend/src/Services/device.ts` / `frontend/src/Types/device/request.ts`** (the RN `RequestNewDevicePayload` also lists `deviceToken` as required). If the generated client types it optional, prefer still sending a placeholder for safety.

**When to call:** immediately after a successful login/refresh-bootstrap, before establishing the socket and before issuing other authenticated requests, since the device row gates them (§7.2). RN registers via `registerNewDevice` (`POST /v1/devices`).

Response: `{ success: true, message: 'Device registered successfully' }` (201).

### 7.6 Other device endpoints (all `JwtWithDeviceGuard`, Bearer)
| Method | Path | Notes |
|---|---|---|
| GET | `/devices` | List my devices (sans tokens); each item has `isCurrent` (matches token's `deviceId`). Powers a "Security / sessions" screen. |
| PUT | `/devices/device/:deviceId/voip-token` | iOS VoIP only — not used on web |
| DELETE | `/devices/device/:deviceId` | Delete one of my devices |
| DELETE | `/devices/:deviceId` | Delete by id (owner or admin); emits `session:invalidate` |
| DELETE | `/devices/my-other-devices` | "Log out all other sessions"; emits `session:invalidate` per removed device |
| DELETE | `/devices/user/:userId/all` | Admin only |
| PATCH | `/devices/activity/device/:deviceId` | Heartbeat (`lastActiveAt`); call on app focus |
| PATCH | `/devices/badge-reset/device/:deviceId`, GET `/devices/badge-count/device/:deviceId` | Native badge counters — irrelevant for web |

**Session invalidation event:** deleting a device emits socket event **`session:invalidate`** (`SocketEvent.sessionInvalidate`) to the affected user's room, with `{ deviceId?, reason }` where `reason ∈ { 'other_sessions', 'all_sessions', 'device_deleted' }`. The web client **must** listen for `session:invalidate`, and if the payload's `deviceId` matches (or is absent → all), force a logout. See `03-websocket-events.md` for the event listener mechanics.

---

## 8. Token storage & the recommended BFF strategy (web)

The RN app stores `accessToken` in secure storage and `refreshToken`/`deviceId`/`userId` in `AsyncStorage` (`frontend/src/Constants/AsyncStorageKeys.ts`), attaching `Authorization: Bearer <accessToken>` via an axios request interceptor (`frontend/src/Utils/api/tokenInterceptor.ts`). On the web, **do not** keep long-lived JWTs in JS-accessible storage (XSS risk). Use a thin BFF.

### 8.1 Cookies via Next Route Handlers
- A Next Route Handler (`/api/auth/login`) proxies `POST /api/v1/auth/login` to the backend (adding the `deviceId` from the request), then sets:
  - `access_token` — **httpOnly, Secure, SameSite=Lax** cookie (TTL ≤ access token 7d).
  - `refresh_token` — **httpOnly, Secure, SameSite=Strict** cookie (TTL = refresh token).
- All subsequent REST calls go through Next Route Handlers (or a server-side proxy) that read the httpOnly `access_token` cookie and forward it as `Authorization: Bearer ...` to the backend. The browser JS never sees the tokens.
- Logout route clears both cookies; also call `DELETE /devices/device/:deviceId` (or `/my-other-devices`) if you want server-side session teardown.

> Because tokens are httpOnly, a pure client-side `fetch` to the backend cannot attach the bearer. Route the API through the BFF, or have the BFF expose the access token only where unavoidable (prefer not to).

### 8.2 `/api/auth/socket-token` for the handshake ⚠️
The Socket.IO gateway authenticates at handshake by reading **`client.handshake.headers.authorization`** as a **raw JWT** (no `Bearer` prefix), verifying it with `JWT_SECRET` (`backend/src/sockets/sockets.service.ts#authenticate`; gateway `io.use(...)` in `backend/src/sockets/sockets.gateway.ts`). The RN client passes the token both as `extraHeaders.Authorization` and `auth.token` (`frontend/src/Classes/SocketManager.ts`).

**Browser constraint:** a browser WebSocket handshake **cannot set arbitrary headers** (`extraHeaders` is ignored by `socket.io-client` on the `websocket` transport). The backend only reads `handshake.headers.authorization`. Therefore the web client needs a **JS-readable, short-lived token** it can hand to the socket. Two routes:
1. **Polling fallback for handshake only** — `socket.io-client` *can* send `extraHeaders` during the initial HTTP polling handshake. But the gateway is configured `transports: ['websocket']` (and `02-backend-rest-api.md`/`03-websocket-events.md` mandate websocket-only), so polling is not available. Do not rely on this.
2. **Recommended:** add a BFF route **`GET /api/auth/socket-token`** that, using the httpOnly cookie, returns the current access token (or a freshly-refreshed one) to the browser as a short-lived JS value. The web socket layer then sets it on the handshake.

> **Open verification item.** Confirm against `03-websocket-events.md` whether the gateway also reads `handshake.auth.token`. As written, `sockets.service.ts` reads **only** `handshake.headers.authorization`. If browser `extraHeaders` truly don't reach it over websocket-only, this is a real gap that may force either (a) a polling-enabled handshake, or (b) putting the token in the connection URL/query — both of which the socket doc must reconcile. **Do not assume the RN `auth: { token }` path works on web.** This is the single riskiest area of web auth parity; resolve it in `03-websocket-events.md` before building the socket layer.

### 8.3 Single-flight refresh interceptor (port of `tokenInterceptor.ts`)
Mirror the RN logic (`frontend/src/Utils/api/tokenInterceptor.ts`) in the BFF / fetch wrapper:
- On a **401** from the backend, attempt **one** refresh (`_retry` guard) by calling `POST /api/v1/auth/refresh-token` with `{ refreshToken, deviceId }`.
- **Single-flight:** while a refresh is in progress (`isRefreshing`), queue concurrent failures and replay them with the new token once refresh resolves (`failedQueue` pattern). This prevents a refresh stampede.
- On refresh success: persist the new access/refresh cookies and retry the original request.
- On **definitive** failure (refresh 401/403, missing/invalid refresh token): clear cookies + state and route to login. On **network/transient** errors: keep the session (RN deliberately does **not** log out on `ERR_NETWORK`).
- **Mirror this on the socket:** the gateway disconnects on a bad/expired token, surfacing a `connect_error`. On `connect_error` (and on `io server disconnect`), the web socket layer must run the **same** single-flight refresh, then reconnect the handshake with the refreshed `/api/auth/socket-token`. Share one refresh primitive between REST and socket so they don't race. (RN's `SocketManager` handles reconnection but does not itself refresh; on web you must add the refresh-on-`connect_error` step. See `03-websocket-events.md`.)

---

## 9. Porting checklist for `unsendnext`

1. **`deviceId` helper** — `crypto.randomUUID()` persisted in `localStorage`; single accessor. (Ref: `frontend/src/Utils/deviceId.ts`.)
2. **Auth service** — wrap the generated OpenAPI client for `register / send-code / resend / verify / login / refresh-token / request-password-reset / verify-reset-password-code / reset-password / change-password`. (Ref: `frontend/src/Services/auth.ts`, `frontend/src/Types/auth/*`.)
3. **Device registration** — call `POST /devices` right after login with `deviceType: 'web'`, a placeholder `deviceToken`, **no `pushPlatform`**. (Ref: `frontend/src/Services/device.ts`, `frontend/src/Types/device/request.ts`.)
4. **BFF cookies** — Next Route Handlers set httpOnly Secure `access_token`/`refresh_token`; proxy REST with the bearer.
5. **`/api/auth/socket-token`** — BFF route returning a short-lived JS-readable token for the handshake (resolve the header-vs-auth question in `03-websocket-events.md`).
6. **Single-flight refresh** — shared between REST 401s and socket `connect_error`; always include `deviceId`; logout only on definitive auth failures. (Ref: `frontend/src/Utils/api/tokenInterceptor.ts`.)
7. **`session:invalidate` listener** — force logout when this socket event targets the current `deviceId` (or all). (Ref: `SocketEvent.sessionInvalidate`; see `03-websocket-events.md`.)

---

## 10. Cross-links
- REST base, OpenAPI client, general auth wiring: `02-backend-rest-api.md`
- Socket handshake auth, `join`-echo quirk, `connect_error`, `session:invalidate`: `03-websocket-events.md`
- User/Device/Thread data models: `05-data-models.md`
- Presence (symmetric privacy) & settings: `09-feature-contacts-profile-settings.md`
- Calls (incoming-call-needs-open-tab limitation): `08-feature-calls.md`
- Out-of-scope native push: `00-product-overview.md`, `15-roadmap-and-estimate.md`
