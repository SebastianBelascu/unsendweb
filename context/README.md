# unsendnext — Context Knowledge Base

This folder is the **single source of project context** for building `unsendnext`: a new **Next.js 16 (App Router)** web client that reaches feature parity with the existing Unsend mobile apps by consuming the **existing, unchanged NestJS backend** over REST (`/api/v1`) + Socket.IO.

Every document here is **grounded in real source** — the backend at `backend/src`, the existing React Native app at `frontend/src` (the portable logic layer we mine for parity), and the **Next.js 16 docs bundled locally** at `node_modules/next/dist/docs/`. Where the source is loosely typed or ambiguous, the docs say so explicitly.

## How to use this folder

**AI coding agents:** Start here, then open the specific numbered doc for your task. Before writing any Next.js code, also read the relevant bundled doc under `node_modules/next/dist/docs/` (see `11-nextjs16-conventions.md`) — your training data for Next.js 16 is stale.

**Developers:** Read `00` → `01` → `02`/`03`/`04`/`05` for the foundation, then jump to the feature doc you're implementing.

## Documents

| # | File | What it covers |
|---|------|----------------|
| 00 | [00-product-overview.md](00-product-overview.md) | What Unsend & unsendnext are; in/out-of-scope; the 5 backend quirks |
| 01 | [01-architecture.md](01-architecture.md) | Stack + rationale; App Router master/detail layout; data flow; BFF role |
| 02 | [02-backend-rest-api.md](02-backend-rest-api.md) | Every REST endpoint by domain; auth model; OpenAPI `/docs-json` typed client |
| 03 | [03-websocket-events.md](03-websocket-events.md) | Socket.IO contract; client/server events; the join-echo & presence quirks |
| 04 | [04-auth-sessions-deviceid.md](04-auth-sessions-deviceid.md) | OTP/login/refresh; `deviceId`; BFF httpOnly cookies + socket-token |
| 05 | [05-data-models.md](05-data-models.md) | Entities; `topicId`/per-user `Thread` model; `refId` idempotency |
| 06 | [06-feature-chat.md](06-feature-chat.md) | DM + group chat: send/receive, typing, receipts, reactions, mentions, sync |
| 07 | [07-feature-email.md](07-feature-email.md) | Mailbox via threads; safe HTML rendering; S3 multipart attachments |
| 08 | [08-feature-calls.md](08-feature-calls.md) | Agora Web SDK; socket signaling state machine; in-tab-only limit |
| 09 | [09-feature-contacts-profile-settings.md](09-feature-contacts-profile-settings.md) | Contacts/import/search; profile/avatar; privacy/presence; devices |
| 10 | [10-state-and-realtime.md](10-state-and-realtime.md) | TanStack Query + Zustand; socket→cache reconciliation; 3-cursor delta-sync |
| 11 | [11-nextjs16-conventions.md](11-nextjs16-conventions.md) | Next 16 specifics; **read bundled docs first**; which doc for which task |
| 12 | [12-coding-conventions.md](12-coding-conventions.md) | TS strict, folders/naming, env vars, testing, lint |
| 13 | [13-reuse-from-react-native.md](13-reuse-from-react-native.md) | Porting map from `frontend/src` (ports vs adapt vs rewrite) |
| 14 | [14-setup-and-running.md](14-setup-and-running.md) | Run the backend + unsendnext locally; env vars; generate the typed client |
| 15 | [15-roadmap-and-estimate.md](15-roadmap-and-estimate.md) | Phased plan + AI-assisted estimate (~9–14.5 weeks) + risk register |

## Cross-cutting cautions (read before building)

These were confirmed against the real backend during documentation and affect multiple features:

- **The backend is immutable.** Anything that would require a backend change (web push, background VoIP, a new `pushPlatform: 'web'`) is out of scope.
- **Socket auth gap to resolve first.** The gateway authenticates the JWT from `handshake.headers.authorization` (raw token), in `backend/src/sockets/sockets.service.ts` — not from `handshake.auth.token`. Browsers can't set headers on a websocket upgrade, so the web socket-auth path must be verified before building the realtime layer. See `03-websocket-events.md` and `04-auth-sessions-deviceid.md`.
- **Receipts are generic `update` events.** There are no `message:delivered`/`message:read` events on the wire; `ack:delivered`/`ack:read` produce generic `update` events into the recipient's userId room. See `03-websocket-events.md`.
- **OpenAPI is loosely typed on parts of the mail/message surface** (many handlers return inline object literals → `any`). Confirm real shapes against `frontend/src/Services` and the factories in `backend/src/types`. Flagged inline throughout `02`, `06`, `07`.
- **A conversation spans multiple per-user `Thread` docs** correlated by `topicId`; messages are idempotent on `(userId + refId)`. See `05-data-models.md`.

## Provenance

Generated from a source-grounded pass over `backend/src`, `frontend/src`, and the bundled Next.js 16 docs. Treat the cited source files as the ultimate ground truth; if a doc and the code disagree, the code wins — and please update the doc.
