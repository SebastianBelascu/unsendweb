# 00 - Product Overview

**Purpose:** Orient any engineer building `unsendnext` (the new Next.js web client) on what Unsend is, what already exists, and what is in vs. out of scope for the web build.

## What Unsend is

Unsend is a **unified messaging platform** that combines three communication surfaces behind one identity and one backend:

- **Chat** — direct messages (DM) and group conversations.
- **Email** — a real mailbox (Wildduck-backed) integrated into the same inbox model.
- **Voice/video calls** — real-time calling powered by Agora.

A single user account spans all three. The product treats chat threads and email as related entities under a shared "conversation" model (see quirk #4 below and `05-data-models.md`), and calls are first-class events tied to the same users and notifications pipeline.

## Existing system (do NOT change)

There is a **production NestJS backend** (~28.5K LOC) at `backend/src`. It already serves multiple native clients:

- React Native app (`frontend/src` — the portable logic layer we mine for parity).
- Native iOS.
- Native Android.

**The backend is treated as immutable for this project.** `unsendnext` consumes it as-is over REST (`/api/v1`) + Socket.IO WebSocket. Any feature that would require a backend change is out of scope. See `01-architecture.md` and `02-backend-rest-api.md` for how the web client connects.

### Backend module inventory (confirmed)

Confirmed from `backend/src/app.module.ts` and the controllers under `backend/src/*/`:

| Module | Controllers (representative) | Web relevance |
|---|---|---|
| `users` | `auth`, `users`, `presence`, `privacy`, `settings`, `user-devices`, `invitation-codes` | Auth, profile, presence, settings (in scope) |
| `threads` | `threads.controller.ts` | Conversation/thread list (in scope) |
| `messages` | `messages`, `chat`, `public-messages` | Chat send/receive (in scope) |
| `sockets` | (gateway, no REST controller) | Realtime transport (in scope) — see `03-websocket-events.md` |
| `contacts` | `contacts.controller.ts` | Contacts/address book (in scope) |
| `email` | `email.controller.ts` | Email send/receive (in scope) |
| `calls` | `calls.controller.ts` | Call signaling + Agora tokens (in scope) |
| `agora` | (service only) | Agora RTC token/service used by `calls` |
| `settings` | `settings.controller.ts` | App/user settings (in scope) |
| `notifications` | `notifications.controller.ts` | Native push (largely out of scope on web) |
| `aws` | `aws.controller.ts` | Media/upload presign (in scope as needed) |
| `favicon` | `favicon.controller.ts` | Link/email favicon helper |
| `webhook` | `webhook.controller.ts` | Inbound provider webhooks (server-side only) |
| `wildduck` | (service) | Email backend integration (server-side) |
| `rbtmq_publisher` | `rbtmq_publisher.controller.ts` | Internal RabbitMQ publishing (server-side) |
| `metrics`, `system-health`, `logger` | `metrics`, `system-health`, `dashboard` | Ops/observability (not a web-client surface) |
| `admin-actions` | `admin-actions.controller.ts` | Admin tooling (see out-of-scope) |
| `autopilot` | (service) | Backend automation (server-side) |

Modules without a REST controller (`sockets`, `agora`, `wildduck`, `autopilot`, `logger`) are infrastructure the web client touches only indirectly (e.g. via the socket gateway or via `calls`/`email` endpoints).

## What unsendnext is

`unsendnext` is a **new Next.js 16 (App Router) web client** whose goal is **feature parity with the native mobile apps**. It is a fresh codebase, not a port, but it reuses the backend contracts and reimplements the logic that the RN app already proves out in `frontend/src` (`Types/`, `Services/`, `Hooks/`, `Redux/`, `Api/`).

Stack and conventions are fixed; see `01-architecture.md` for the full stack rationale. In short: TanStack Query v5 as the server-state source of truth, Zustand for ephemeral realtime state, `socket.io-client` v4 (websocket-only), `agora-rtc-sdk-ng` for calls, a typed client generated from the backend OpenAPI at `/docs-json`, and a thin BFF (Next Route Handlers) for httpOnly token cookies plus a `/api/auth/socket-token` route for the socket handshake.

## In-scope feature domains

| Domain | Summary | Detail doc |
|---|---|---|
| **Chat (DM + group)** | Send/receive messages, conversation list, read state, idempotent send, realtime updates | `06-feature-chat.md` |
| **Email** | Mailbox view, read/compose, safe HTML rendering (DOMPurify + sandboxed iframe), thread history | `07-feature-email.md` |
| **Contacts / profile / settings** | Address book, own profile, privacy + presence settings, account settings | `09-feature-contacts-profile-settings.md` |
| **Voice / video calls** | Place/answer calls via Agora, call UI, signaling over sockets | `08-feature-calls.md` |

## Out of scope / web limitations

These are deliberately excluded because they require capabilities the web platform lacks or would force a backend change (which is forbidden for this project):

- **Native push notifications.** The `notifications` and `user-devices` modules target native device tokens. The web client cannot register native push; it relies on in-tab realtime via sockets. (Web Push could be a future roadmap item — see `15-roadmap-and-estimate.md` — but is not parity-required and would need backend work.)
- **VoIP / background incoming calls.** On web, incoming calls only ring **while a tab is open**. There is no VoIP push or background wake; delivering ringing to a closed/backgrounded tab would require a backend change and is out of scope. (Quirk #5.)
- **Admin dashboard.** Admin and ops surfaces (`admin-actions`, `system-health`/`dashboard`, `metrics`) are a **separate, proxied admin application**, not part of the end-user web client. `unsendnext` does not implement them.
- **Server-side-only modules.** `webhook`, `rbtmq_publisher`, `autopilot`, `wildduck`, `agora` (token issuance), `logger` are backend internals; the web client never calls them directly.

## Important backend quirks to respect

These shape multiple features; each is documented in depth in the linked doc, but flagged here so they are not forgotten:

1. **Socket `join` echo.** When a client joins a room, the server emits an event **whose name equals the room name** (`io.in(room).emit(room, ...)`). The client must register a listener keyed by the exact room name it joined. See `03-websocket-events.md`.
2. **Symmetric-privacy presence.** A user with `showOnlineStatus = false` neither broadcasts **nor receives** presence. See `09-feature-contacts-profile-settings.md`.
3. **Idempotent messages on `(userId + refId)`.** The client supplies a `refId` (UUID) per message so retries do not duplicate. See `06-feature-chat.md`.
4. **A conversation = multiple per-user `Thread` documents sharing one `topicId`.** Each participant has their own `Thread` doc; they are correlated by `topicId`. See `05-data-models.md`.
5. **Web incoming calls require an open tab** (no background/VoIP push). See `08-feature-calls.md`.

## Where to go next

- Architecture, stack, and BFF: `01-architecture.md`
- API base, auth, OpenAPI client: `02-backend-rest-api.md`
- Realtime sockets (including the join-echo quirk): `03-websocket-events.md`
- Data models (`Thread`/`topicId`, messages, etc.): `05-data-models.md`
- Feature docs: `06-feature-chat.md`, `07-feature-email.md`, `09-feature-contacts-profile-settings.md`, `08-feature-calls.md`
- Phasing and future/excluded items: `15-roadmap-and-estimate.md`
