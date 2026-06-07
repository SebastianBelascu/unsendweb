# 01 - unsendnext Architecture

> Purpose: the top-level map of the **unsendnext** web client — the decided stack, the App Router route layout (master/detail shell), how data flows (REST via a typed client + TanStack Query, realtime via a single socket manager, a thin BFF for tokens), and the `lib/`/`types/` layout. Cross-links to `10-state-and-realtime.md` and `11-nextjs16-conventions.md` for depth.

unsendnext is a **new Next.js 16 web client** that must reach feature parity with the existing native mobile apps (React Native, native iOS/Android). The **production NestJS backend is not changed** — the web app consumes it as-is over REST (`/api/v1`) + a Socket.IO WebSocket gateway. Source roots referenced here: backend at `backend/src`, the portable RN logic layer at `frontend/src` (`Types/`, `Services/`, `Hooks/`, `Redux/`, `Api/`).

> Note on the docs you'll find under `node_modules/next/dist/docs/`: this is Next.js 16 and **has breaking changes vs. older Next** (see `unsendnext/AGENTS.md`). Read the bundled guide for any router/file convention before writing code.

---

## 1. Decided stack (and why)

| Concern | Choice | Why (1-liner) |
| --- | --- | --- |
| Framework | Next.js 16.2.4 (App Router) | File-system routing, nested layouts, Route Handlers double as the BFF. |
| UI runtime | React 19.2.4 + TypeScript (strict) | Concurrent React; strict types catch the backend's loose `any` shapes early. |
| Styling | Tailwind CSS v4 | Utility-first; pairs with shadcn/ui. See `11-nextjs16-conventions.md`. |
| Lint | ESLint 9 (flat config) | Matches Next 16's `eslint.config.mjs`. |
| Server data + cache | TanStack Query v5 | **Single source of truth for server entities**; socket events write into the cache. |
| Ephemeral realtime state | Zustand | Connection status, typing peers, active call, presence — non-server UI state. |
| Realtime | socket.io-client v4 | Must match the gateway. **`transports: ['websocket']` only** (gateway is `@WebSocketGateway({ transports: ['websocket'] })`, `backend/src/sockets/sockets.gateway.ts:27`). |
| Calls | agora-rtc-sdk-ng | Agora Web SDK; the backend already issues/manages calls (`backend/src/calls`, `backend/src/agora`). |
| Forms | react-hook-form + Zod | Typed, validated forms; Zod also narrows loose API responses. |
| Components | shadcn/ui (Radix) on Tailwind | Accessible primitives, owned in-repo. |
| Long lists | `@tanstack/react-virtual` | Chat/mail/contacts can be thousands of rows. |
| Email safety | DOMPurify + sandboxed iframe | Render untrusted email HTML without script/exfil risk. |
| API typing | openapi-typescript + openapi-fetch | Types auto-generated from the backend OpenAPI at `/docs-json`. |
| Auth transport | Next.js Route Handlers (BFF) | httpOnly Secure cookies for tokens; one route hands the socket a short-lived JS-readable token. |

Path alias: `'@/*' -> './*'` (root-relative).

> **Source-of-truth rule:** the OpenAPI spec is loosely typed in places (NestJS returns `any` / untyped objects on several routes). Where the generated client yields `any`, confirm the real shape against the RN `frontend/src/Services/*` and `frontend/src/Types/*` and wrap with a Zod schema. Field/DTO inventories live in `05-data-models.md`; do not invent shapes here.

---

## 2. App Router layout (master/detail shell)

The app uses **two route groups** under `app/` to get two distinct shells without affecting URLs (Next 16 route groups: a `(name)` folder is omitted from the path):

- `(auth)` — unauthenticated shell (centered card, no nav): login, register, verify, reset.
- `(app)` — authenticated shell: a persistent **master/detail** layout (left rail/list = "master", right pane = "detail"). The list and the right pane are both preserved across navigation because they live in a shared `layout.tsx` (App Router layouts preserve state and do not re-render on navigation).

```
app/
  layout.tsx                # root layout: <html>/<body>, Providers (Query, Zustand bridge, Theme)
  page.tsx                  # "/" -> redirect to default section (e.g. /chat)
  globals.css

  (auth)/
    layout.tsx              # minimal centered shell (no socket, no nav)
    login/page.tsx
    register/page.tsx
    verify/page.tsx
    reset-password/page.tsx

  (app)/
    layout.tsx              # AppShell: nav rail + socket boot + presence; renders {children}
    chat/
      layout.tsx            # master: conversation list (virtualized)
      page.tsx              # detail empty-state ("select a conversation")
      [topicId]/page.tsx    # detail: a conversation (see quirk #4 below)
    mail/
      layout.tsx            # master: folders/filters + thread list
      [filter]/
        page.tsx            # filtered thread list focus, empty detail
        [threadId]/page.tsx # detail: an email thread
    calls/
      page.tsx              # call history (master) + incoming/active call UI
    contacts/
      page.tsx              # contacts list + detail
      [contactId]/page.tsx
    mentions/
      page.tsx              # @-mentions inbox
    settings/
      page.tsx              # settings index
      [section]/page.tsx    # profile, privacy, devices, etc.

  api/                      # BFF — Route Handlers (route.ts), see §4

components/                 # shared UI (shadcn/ui + app components)
lib/                        # non-routable app logic (see §5)
types/                      # shared TS types incl. generated OpenAPI types
```

Routing facts to honor (from the Next 16 bundled guide, `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` and `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`):

- A folder is **not routable** until it has a `page.tsx` (or `route.ts`). Colocated non-route files are safe; use `_folder` for private (non-routable) folders if you colocate inside `app/`.
- **Dynamic segments** use `[param]`. `params` and `searchParams` are **Promises** in Next 16 — `await props.params`. Use the global `PageProps<'/chat/[topicId]'>` / `LayoutProps` helpers (generated by `next dev`/`next build`/`next typegen`).
- For the master/detail "list stays mounted while detail changes" UX, prefer **nested layouts** (`chat/layout.tsx` holds the list, `[topicId]/page.tsx` is the detail). If you later want the detail to render as an overlay over the list, use **parallel + intercepting routes** (`@slot`, `(.)folder`) — out of scope for v1.

### Server vs. Client components

This app is **realtime and interactive**, so most leaf UI is `'use client'` (it needs `useState`/`useEffect`, the socket, TanStack Query hooks, and browser APIs). Keep the boundary as deep as possible:

- Root/shell `layout.tsx` files can stay Server Components for the static frame; wrap the interactive parts (Query provider, socket boot, nav with active state) in small Client Components passed as `children`.
- Token reads/writes and OpenAPI-secret handling live **only** in `api/` Route Handlers and server code — never import a module that touches cookies/secrets into a Client Component (use the `server-only` guard; see `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`).
- Data is generally fetched **client-side** through TanStack Query (the cache must stay live for socket writes), not via Server-Component `fetch`. Server Components are used for the shell, metadata, and redirects, not for the live entity lists.

---

## 3. Data flow

### 3.1 REST — typed client + TanStack Query

```
Component
  -> useQuery / useMutation (lib/query/*)
      -> openapi-fetch client (lib/api/client.ts), baseUrl = /api/v1 via BFF proxy
          -> NestJS REST
```

- The client is generated from `/docs-json` with `openapi-typescript` (types) + `openapi-fetch` (runtime). One wrapper in `lib/api/client.ts` sets the base URL and attaches auth (the browser sends the httpOnly cookie to our BFF, which forwards the Bearer JWT — see §4).
- TanStack Query owns the cache. **Query keys are derived from backend identifiers** so socket events can target them precisely — e.g. `['thread', threadId]`, `['messages', topicId]`, `['threads', filter]`, `['contacts']`, `['calls','history']`. Conventions live in `10-state-and-realtime.md`.
- **Mutations are idempotent on `(userId + refId)`** (quirk #3): the client generates a `refId` (UUID) per outbound message and supplies it on send so retries/reconnects don't duplicate. This also drives optimistic insert + reconcile (the echoed socket `create` carries the same `refId`).

Backend REST surface (controller prefixes, all under global prefix `/api/v1`, confirmed in `backend/src/**/**.controller.ts`):

| Domain | Prefix | Source |
| --- | --- | --- |
| Auth | `/auth` | `backend/src/users/auth.controller.ts` |
| Users | `/users` | `backend/src/users/users.controller.ts` |
| Presence | `/users/presence` | `backend/src/users/presence.controller.ts` |
| Privacy | `/users/me/privacy` | `backend/src/users/privacy.controller.ts` |
| Threads | `/threads` | `backend/src/threads/threads.controller.ts` |
| Messages | `/messages` | `backend/src/messages/messages.controller.ts` |
| Chat | `/chat` | `backend/src/messages/chat.controller.ts` |
| Email | `/email` | `backend/src/email/email.controller.ts` |
| Calls | `/calls` | `backend/src/calls/calls.controller.ts` |
| Contacts | `/contacts` | `backend/src/contacts/contacts.controller.ts` |
| Devices | `/devices` | `backend/src/users/user-devices.controller.ts` |
| Settings | `/settings` | `backend/src/settings/settings.controller.ts` |
| Attachments | `/attachment` | `backend/src/aws/aws.controller.ts` |
| Notifications | `/notifications` | `backend/src/notifications/notifications.controller.ts` |

> Endpoint-by-endpoint method/path/DTO inventories belong in the per-domain docs (`05-data-models.md`, and the chat/mail/calls/contacts docs), not here.

### 3.2 Realtime — one socket manager writing into the Query cache

A **single socket-manager singleton** (`lib/socket/`) owns the one Socket.IO connection. Components never hold their own socket; they subscribe via hooks. Incoming events are translated into **TanStack Query cache writes** (`setQueryData` / `invalidateQueries`) so the cache stays the single source of truth; only ephemeral signals (typing, presence, connection status, active call) go to Zustand. This mirrors the RN architecture: one `SocketManager` singleton (`frontend/src/Classes/SocketManager.ts`) + a `SocketProvider` (`frontend/src/Contexts/Socket/SocketContext.tsx`) feeding `useMessageUpdates`/`useThreadUpdates` — except RN writes to a Realm DB where we write to the Query cache.

Handshake (gateway authenticates **once at connect**, `backend/src/sockets/sockets.gateway.ts:46-61` + `backend/src/sockets/sockets.service.ts`):

- The gateway's `authenticate()` reads the JWT from `client.handshake.headers.authorization` and verifies it with `JWT_SECRET`. The RN client also passes it in `auth.token`; send the token in **both** the handshake `auth` payload and the `Authorization` header to be safe (the RN `SocketManager` does exactly this).
- A bad/missing token → the gateway disconnects the socket. On connect the gateway auto-joins the socket to a room named by `socket.id` **and** a stable room named by `userId` (used for reliable per-user delivery).

Critical gateway quirks the web client must implement (full event catalog in `10-state-and-realtime.md`):

1. **Room-name-as-event-name.** On `join`, the server emits an event **whose name equals the room name** (`io.in(room).emit(room, ...)`, `sockets.gateway.ts:154-168`). After joining a room (e.g. a `topicId` or `threadId`), register a listener **keyed by that exact room string** to receive its join/activity payloads. Generic message fan-out uses fixed event names (`create`, `update`, `delete`, plus typing events) — see `10-state-and-realtime.md`.
2. **Symmetric-privacy presence.** A user with `showOnlineStatus=false` neither **broadcasts** nor **receives** presence: `presence:subscribe` is a no-op for an opted-out requester, and the connect/disconnect handlers skip emitting for opted-out users (`sockets.gateway.ts:82-95`, `273-324`). Subscribe to peers via `presence:subscribe { usernames }`; expect `presence:online` / `presence:offline`. Don't assume you'll get events.
3. **Idempotent messages on `(userId + refId)`** (also a REST concern, §3.1): supply a client `refId` so reconnect retries don't duplicate.
4. **A conversation = multiple per-user Thread docs sharing one `topicId`.** Each participant owns their own `Thread` document; they're correlated by `topicId`. Typing/seen fan-out resolves recipients by collecting `thread.userId` across all threads for a `topicId` (`sockets.gateway.ts:205-216`). So the chat route is keyed by **`[topicId]`** (the conversation), while per-user actions (mark-seen, room joins) use `threadId`. Join both the `topicId` and the current `threadId` rooms when a conversation is open (the RN `useRoomManagement` hook does this, `frontend/src/Hooks/Socket/useRoomManagement.tsx`).
5. **Web incoming calls only work while a tab is open.** There is **no VoIP/background push** on web (that would require a backend change and is **OUT OF SCOPE**). Incoming-call events arrive over the live socket; if no tab is open the call is missed. Surface this limitation in the calls UI. Call lifecycle events (`call-received`, `call-started`, `call-ended`, `camera-on-invitation`, `end-call`) are handled by the gateway (`sockets.gateway.ts:358-585`); Agora media is separate (`lib/agora/`).

Outbound emits the client uses (selected, from the gateway's `@SubscribeMessage` handlers): `join`, `leave`, `typing`, `message` (seen marker), `ack:delivered`, `ack:read`, `presence:subscribe`/`presence:unsubscribe`, `update-call`, `call-received`, `call-started`, `end-call`, `camera-on-invitation`, `ping`. Also listen for `session:invalidate` (server-forced logout → clear tokens, disconnect; RN handles this in `SocketContext.tsx`).

### 3.3 BFF — token cookies + socket token

A thin BFF lives in `app/api/` as Route Handlers. It exists because (a) tokens must be in **httpOnly Secure cookies** (not readable by JS, to resist XSS token theft) while (b) the socket handshake runs in the browser and **needs a JS-readable token**.

| Route (under `/api`) | Method | Responsibility |
| --- | --- | --- |
| `api/auth/login/route.ts` | POST | Proxy login to NestJS `/auth/login`; set httpOnly Secure cookies for access + refresh JWT. |
| `api/auth/logout/route.ts` | POST | Clear auth cookies. |
| `api/auth/refresh/route.ts` | POST | Use refresh cookie to mint a new access token via `/auth/refresh-token`; reset cookie. |
| `api/auth/socket-token/route.ts` | GET | Return a **short-lived, JS-readable** token for the socket handshake (read from the httpOnly cookie server-side, hand a minimal token back to the client). |
| `api/[...path]/route.ts` (proxy) | * | Forward authenticated REST calls to NestJS, injecting the `Authorization: Bearer <jwt>` header from the httpOnly cookie so the browser never holds the JWT. |

Flow: browser → BFF (reads httpOnly cookie, adds Bearer) → NestJS `/api/v1/*`. For the socket: browser → `GET /api/auth/socket-token` → token → `socket.io-client` handshake. Refresh handling and exact cookie names/flags are detailed in the auth doc (`04-auth-sessions-deviceid.md` / see `10-state-and-realtime.md` for the socket-token lifecycle).

> CORS aside: the backend sets `origin: '*'` with `credentials: true` and `/docs-json` is basic-auth protected (`backend/src/main.ts:30-100`). The browser still talks to **our own origin** (the BFF), which forwards server-to-server, so CORS/basic-auth never block the client.

---

## 4. `lib/` layout

`lib/` holds all non-routable app logic (the web analogue of RN `frontend/src/Services` + `Hooks` + `Classes`). Suggested structure:

```
lib/
  api/        # openapi-fetch client + generated-type re-exports + Zod refinements
              #   client.ts, schemas/*.ts  (see types/ for raw generated types)
  socket/     # single Socket.IO manager singleton + typed event registry +
              #   cache-writer mappers (socket event -> setQueryData) + React hooks
              #   manager.ts, events.ts, useSocket.ts, useRoomManagement.ts
  agora/      # Agora Web SDK wrapper: client/track lifecycle, join/leave channel,
              #   mic/camera toggles, device selection
  query/      # TanStack Query setup: queryClient, queryKeys, per-domain hooks
              #   (useThreads, useMessages, useContacts, useCalls, ...) + mutations
  stores/     # Zustand stores: connection, presence, typing, activeCall, ui
  email/      # email HTML sanitization (DOMPurify config) + iframe rendering helpers
  utils/      # misc (refId/uuid, date, formatting)

types/
  openapi.d.ts   # generated by openapi-typescript from /docs-json (committed or built)
  *.ts           # hand-written shared types where OpenAPI is `any`; mirror frontend/src/Types
```

Boundaries:
- `lib/api` and `lib/socket` are **client-side**; the BFF (`app/api`) is the only place that reads cookies/secrets.
- `lib/socket` is the **only** module that creates a Socket.IO connection. Everything else subscribes through its hooks.
- `lib/query` is the **only** owner of `queryClient` and `queryKeys`; `lib/socket` imports `queryKeys` to write into the cache (the two are the spine of the state model — depth in `10-state-and-realtime.md`).

---

## 5. Where to read next

- `10-state-and-realtime.md` — TanStack Query + Zustand split, query-key registry, the full socket event catalog, socket→cache mapping, presence/typing/seen mechanics, socket-token lifecycle.
- `11-nextjs16-conventions.md` — Next 16 specifics (Promise `params`/`searchParams`, route groups, Server/Client boundaries, Tailwind v4, ESLint flat config) that diverge from older Next.
- `05-data-models.md` — DTO/field inventories and the per-domain endpoint tables (the source of truth where this doc only summarizes prefixes).
