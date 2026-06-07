<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# unsendnext — project context

This is **unsendnext**, a Next.js 16 web client for the Unsend messaging platform. It consumes the existing, **unchanged** NestJS backend (at `../src`) over REST (`/api/v1`) + Socket.IO.

**Before working on any feature, read [`context/README.md`](context/README.md)** — the project knowledge base (backend REST API, WebSocket events, auth, data models, per-feature specs, state/realtime architecture, Next.js 16 conventions, coding conventions, RN-reuse map, setup, roadmap). Open the specific numbered doc for your task; if a doc and the code disagree, the code wins.

Hard rules:
- The backend is **immutable**. Anything requiring a backend change (web push, background VoIP, a `pushPlatform: 'web'`) is out of scope.
- Server entities come through the typed client generated from the backend OpenAPI (`/docs-json`) + TanStack Query v5; never hand-roll `fetch` in components.
- Realtime is a single `socket.io-client` (websocket-only) manager whose events reconcile into the Query cache. Respect the documented socket quirks: join-echo (room name == event name), generic `update` receipts, and the handshake-header auth gap (see `context/03-websocket-events.md`).
