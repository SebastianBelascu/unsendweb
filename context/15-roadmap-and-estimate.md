# 15 - Roadmap & Estimate

**Purpose:** Give one senior engineer (working with AI assistance) a phase-by-phase plan, an effort estimate, and a risk register for taking `unsendnext` from empty repo to feature parity with the native mobile apps — without changing the backend.

## How to read this

- Effort is in **working days** for **one senior dev + AI assist**, assuming the backend is stable and the OpenAPI spec at `/docs-json` is consumed as-is.
- Phases are roughly sequential but overlap (e.g. design-system work continues into feature phases). The recommended kickoff (see "Sequencing recommendation") deliberately interleaves Phase 1 with a thin chat slice to de-risk early.
- Estimates are ranges, not commitments. The drivers that move them are listed under "What moves the estimate."
- Feature scope, contracts, and quirks live in the linked docs — this file does not restate them. See `00-product-overview.md` for the in/out-of-scope baseline.

## Phase plan & estimate

| # | Phase | Working days | What "done" means | Primary refs |
|---|---|---|---|---|
| 1 | Scaffold + typed client + auth | **4–7** | Next.js 16 app boots; OpenAPI-generated typed client wired; BFF route handlers issue httpOnly token cookies; `/api/auth/socket-token` returns a short-lived handshake token; login/refresh/logout flow works end to end | `01-architecture.md`, `04-auth-sessions-deviceid.md`, `11-nextjs16-conventions.md` |
| 2 | Design system + app shell | **4–6** | shadcn/ui on Tailwind v4 installed; core primitives, theme, layout shell (nav, conversation/inbox split panes), routing skeleton, loading/empty/error states | `12-coding-conventions.md`, `11-nextjs16-conventions.md` |
| 3 | Chat real-time core | **10–16** | Conversation list, message thread, idempotent send (`refId`), read state, socket wiring (join-echo listener, presence), TanStack Query cache as source of truth with socket writes | `06-feature-chat.md`, `03-websocket-events.md`, `05-data-models.md` |
| 4 | Email client | **8–13** | Mailbox list, read view with safe HTML (DOMPurify + sandboxed iframe), compose/send, thread history, attachments | `07-feature-email.md`, `05-data-models.md` |
| 5 | Contacts / profile / settings | **4–6** | Address book, own profile edit, privacy + presence settings (symmetric-privacy honored), account settings | `09-feature-contacts-profile-settings.md` |
| 6 | Calls (Agora web) | **7–12** | Place/answer voice + video via `agora-rtc-sdk-ng`, call signaling over sockets, in-call UI, device selection; open-tab-only ringing accepted as the documented limitation | `08-feature-calls.md` |
| 7 | Polish / QA / responsive | **8–12** | Responsive/mobile-web layouts, accessibility pass, virtualized lists tuned, error/retry/reconnect UX, cross-browser test, multi-tab behavior verified | all feature docs |
| | **TOTAL** | **~45–72** | Feature parity with mobile | — |

**~45–72 working days ≈ 9–14.5 weeks** for one senior dev + AI to reach parity.

## What moves the estimate

### Down (toward the low end)

- **Reuse the RN logic layer.** `frontend/src` (`Types/`, `Services/`, `Hooks/`, `Redux/`, `Api/`) already proves out the request shapes, socket event handling, idempotency, and delta-sync logic. Porting and adapting this is far cheaper than rediscovering the contracts. See `13-reuse-from-react-native.md`.
- **Complete OpenAPI spec.** Where `/docs-json` is well-typed, the generated client (openapi-typescript + openapi-fetch) removes most hand-written DTO work and keeps types honest.
- **Fixed stack & conventions.** No stack debate; `01-architecture.md`, `11-nextjs16-conventions.md`, and `12-coding-conventions.md` are decided. Generators (shadcn/ui, OpenAPI) absorb boilerplate.

### Up (toward the high end)

- **Loose mail typing.** Email endpoints return loosely-typed (`any`-heavy) shapes in OpenAPI; types must be confirmed against `frontend/src/Services/` and pinned by hand. Adds work to Phase 4. (Where OpenAPI says `any`, confirm against RN Services/ — do not invent fields.)
- **BFF / socket-token hardening.** Getting httpOnly cookie issuance, refresh, and the JS-readable short-lived socket token right (rotation, expiry, CSRF posture) is fiddly and security-sensitive; adds to Phase 1.
- **Agora cross-browser.** Web RTC behaves differently across Chrome/Safari/Firefox (permissions, autoplay, device enumeration, codec quirks); adds to Phases 6 and 7.
- **Offline / IndexedDB.** If offline caching or local persistence beyond the Query cache is wanted, that is net-new web work not inherited from RN.
- **Native parity creep.** "Match the app" can pull in long-tail native affordances (haptics, native pickers, share sheets) that need web equivalents or explicit de-scoping.

## Top risks

| Risk | Why it bites | Where it lands | Mitigation |
|---|---|---|---|
| **Socket dynamic-event quirk** | On `join`, the server emits an event **named after the room** (`io.in(room).emit(room, ...)`); a listener keyed by a fixed event name silently misses updates | Phase 3 | Register listeners keyed by the exact room name on join; encapsulate in the socket layer once. See `03-websocket-events.md` |
| **Token + socket auth tension** | httpOnly cookies (good for REST) are invisible to JS, but the Socket.IO handshake needs a token in `auth`; the `/api/auth/socket-token` bridge must hand out a short-lived JS-readable token without weakening the cookie model | Phase 1 | Dedicated BFF route, short TTL, re-fetch on reconnect; document the trust boundary in `04-auth-sessions-deviceid.md` |
| **Safe email HTML** | Untrusted email HTML is an XSS vector; rendering it wrong is a security incident | Phase 4 | DOMPurify sanitize + render inside a sandboxed iframe; no inline execution. See `07-feature-email.md` |
| **Agora web** | Browser RTC permission/autoplay/device differences; getting reliable ring/answer/hangup is non-trivial | Phases 6–7 | Build a thin call slice early in Phase 6; test Chrome + Safari first |
| **OpenAPI completeness on mail** | Loosely-typed mail endpoints mean the generated client lies; runtime shape may differ | Phase 4 | Cross-check every mail call against `frontend/src/Services/`; add Zod parse at the boundary |
| **Delta-sync correctness** | Conversation/message sync must reconcile socket pushes with paged fetches without dropping or duplicating; a conversation = multiple per-user `Thread` docs sharing one `topicId` | Phase 3 | Mirror RN sync logic; key the Query cache by `topicId`; rely on `refId` idempotency. See `05-data-models.md`, `06-feature-chat.md` |
| **Multi-tab** | Multiple open tabs share cookies but each holds its own socket; presence, read state, and ringing can race | Phases 3, 6, 7 | Decide a tab model (leader election or independent tabs) and test it explicitly in Phase 7 |
| **Inbox scale** | Large mailboxes/conversation lists must stay smooth | Phases 3, 4, 7 | `@tanstack/react-virtual` for all long lists; paginate via the backend; profile under realistic volume |

Two product-level constraints are not risks but fixed limitations to respect (see `00-product-overview.md`): **no native push** and **incoming calls only ring while a tab is open** (quirk #5) — both would require backend changes and are out of scope.

## Sequencing recommendation

**Start with Phase 1 plus a thin vertical chat slice.** Rather than fully finishing the design system before touching features, drive a single conversation end to end — log in → open one conversation → receive a live message over the socket → send an idempotent reply → see read state — as early as possible.

Doing this in the first ~2 weeks exercises the three highest-leverage risk areas at once: the **token + socket auth bridge** (Phase 1 BFF), the **socket join-echo quirk** and **delta-sync** (Phase 3 core), and the real shape of the **OpenAPI client** against a live backend. It validates the architecture before broad UI investment, and the resulting socket/auth/query plumbing is the foundation every later phase reuses. Email, contacts, and calls then layer onto a proven core.

## Cross-links

- Product scope, in/out of scope, quirks: `00-product-overview.md`
- Architecture, stack, BFF design: `01-architecture.md`
- API base, auth, OpenAPI client: `02-backend-rest-api.md`, `04-auth-sessions-deviceid.md`
- Realtime sockets (join-echo, presence): `03-websocket-events.md`
- Data models (`Thread`/`topicId`, messages): `05-data-models.md`
- Feature docs: `06-feature-chat.md`, `07-feature-email.md`, `09-feature-contacts-profile-settings.md`, `08-feature-calls.md`
- Next.js 16 + coding conventions: `11-nextjs16-conventions.md`, `12-coding-conventions.md`
- Reusing the RN logic layer: `13-reuse-from-react-native.md`
