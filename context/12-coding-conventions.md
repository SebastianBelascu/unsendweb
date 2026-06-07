# 12 - Coding Conventions

Purpose: the prescriptive style and structure rules every contributor (human or agent) follows when building **unsendnext**, the Next.js 16 web client for the Unsend platform.

> The backend is frozen. This client consumes the existing NestJS API as-is over REST (`/api/v1`) + Socket.IO. See `01-architecture.md` / `05-data-models.md` for the system shape and `AGENTS.md` at the repo root: **this is Next.js 16, not the version in your training data — read `node_modules/next/dist/docs/01-app/` before using an App Router API.**

---

## 1. TypeScript: strict, no escape hatches

`tsconfig.json` already sets `"strict": true`, `"isolatedModules": true`, `"noEmit": true`, `"moduleResolution": "bundler"`, `target ES2017`, `jsx: react-jsx`. Treat these as immutable; do not loosen `strict`.

Rules:

- **No `any`.** Prefer `unknown` + a type guard or a Zod parse at the boundary. The eslint config (`eslint-config-next/typescript`) flags `@typescript-eslint/no-explicit-any`.
- **Never silence the type checker.** No `@ts-ignore` / `@ts-expect-error` / `as any` to make code compile. If a type is genuinely wrong, fix the type. If you must assert, narrow with a guard and leave a comment explaining the invariant.
- **The backend OpenAPI is loosely typed in places.** Some `/docs-json` response bodies surface as `any` / `Record<string, unknown>` (the NestJS DTOs are not fully annotated). When the generated client returns `any` for a field you depend on, do **not** spread it blindly — define a hand-written interface in `types/`, validate the shape (Zod) where it matters, and add a comment: `// OpenAPI returns 'any' here; shape confirmed against frontend/src/Services/<x>.ts`. Cross-check the RN logic layer (`frontend/src/Types/`, `frontend/src/Services/`) for the real shape.
- **Be explicit at exported boundaries.** Public functions, hooks, and component props get explicit return/prop types; locals may rely on inference.
- **Prefer `type` aliases for unions/props and `interface` for object contracts** — pick one per file and stay consistent; do not redeclare backend entity shapes that already live in `types/` or the generated client.
- Enable `import type { ... }` for type-only imports (`isolatedModules` requires it for re-exported types).

## 2. The `@/*` path alias

`tsconfig.json` maps `"@/*" -> "./*"` (project root). Use it for **all** cross-directory imports.

```ts
// good
import { apiClient } from "@/lib/api/client";
import { useThreads } from "@/lib/queries/threads";
import type { Thread } from "@/types/thread";

// bad — brittle relative climbing
import { apiClient } from "../../../lib/api/client";
```

- Same-folder imports may stay relative (`./Message`, `./useScrollLock`).
- Do **not** invent new aliases; `@/*` is the only one configured.
- Vitest must resolve `@/*` too — wire it via `vite-tsconfig-paths` (see §8) so tests and the app agree.

## 3. Folder & naming conventions

The App Router lives in `app/` (already present: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`). Non-route code lives in top-level siblings of `app/`, all reachable via `@/`.

| Folder | Holds | Notes |
| --- | --- | --- |
| `app/` | Routes, layouts, route-scoped UI | Route segments + colocated `loading.tsx`, `error.tsx`, `page.tsx`, BFF `route.ts` handlers |
| `lib/` | Non-UI logic: API client, query/mutation hooks, socket client, Zustand stores, Agora wrapper, utils | The "portable logic layer", mirrors RN `frontend/src/Services` + `Hooks` |
| `components/` | Reusable React components shared across routes | shadcn/ui primitives under `components/ui/` |
| `types/` | Hand-written shared TypeScript types | The **generated** OpenAPI types live in `lib/api/` (see §5), not here |
| `app/api/` | BFF Route Handlers (auth cookies, socket-token) | See `04-auth-sessions-deviceid.md` |

Naming:

- **Components / component files: `PascalCase`** — `MessageBubble.tsx`, `ThreadList.tsx`. One primary component per file; named after the file.
- **Hooks: `useX.ts`**, camelCase export — `useSocket.ts`, `useThreadMessages.ts`.
- **Non-component modules (lib, utils, stores): `kebab-case` or `camelCase`** — pick one per subtree and stay consistent (e.g. `lib/api/client.ts`, `lib/stores/presence-store.ts`).
- **App Router special files use Next's exact lowercase names** — `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`, `template.tsx`, `default.tsx`. Do not rename or PascalCase these.
- **Route folders: lowercase, kebab-case**; dynamic segments `[id]`, route groups `(group)`, private folders `_internal`.
- **Colocation is encouraged**: route-only components, helpers, and `*.test.ts(x)` files may sit next to the `page.tsx` that uses them. Promote to `components/` or `lib/` only when a second route needs them.

## 4. Component conventions: Server vs Client

Next.js App Router components are **Server Components by default**. Keep them server-side unless a component needs the browser. Add `"use client"` only when you need:

- React hooks (`useState`, `useEffect`, `useRef`, `useContext`), or any TanStack Query / Zustand hook;
- event handlers (`onClick`, `onChange`), browser APIs (`window`, `localStorage`), or DOM refs;
- third-party client-only SDKs — `socket.io-client`, `agora-rtc-sdk-ng`, `DOMPurify` in the iframe wrapper, `react-hook-form`.

Rules:

- **Push `"use client"` to the leaves.** Keep layouts and page shells as Server Components; mark only the interactive subtree. A `"use client"` boundary makes the whole subtree client-rendered, so put it as deep as practical.
- **`"use client"` is the first line of the file**, before imports.
- This app is heavily real-time and auth-gated, so most chat/call surfaces are client components. That is expected — but the route's outer `layout.tsx` / `page.tsx` can still be a Server Component that renders a client child.
- **Async Server Components cannot be unit-tested** with Vitest/RTL yet (Next docs `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`); cover those with Playwright E2E instead (§8).
- Tokens are httpOnly cookies handled by the BFF; **do not read auth cookies in client components.** Server Components / Route Handlers read cookies via `next/headers`. See `04-auth-sessions-deviceid.md`.

## 5. Data fetching: generated client + TanStack Query only

There are two correct ways to talk to the backend, and **raw `fetch` in a component is never one of them.**

The typed client is generated from the backend OpenAPI spec:

- Source of truth: `GET /docs-json` (basic-auth protected — see `backend/src/main.ts` lines 91-100; export it once with creds and commit the spec, or fetch at build time).
- Tooling: `openapi-typescript` produces `lib/api/schema.d.ts`; `openapi-fetch` wraps it into a typed client in `lib/api/client.ts`.
- REST base URL is `${NEXT_PUBLIC_API_BASE_URL}` and the global prefix is `/api/v1` (`backend/src/main.ts` line 45). Bake the prefix into the client `baseUrl` once; don't repeat it per call.

Conventions:

- **Every REST call goes through the generated `apiClient`.** No `axios`, no bare `fetch` to the API in components or hooks. (The RN app used `axiosInstance`; we replace it with the typed client — see `frontend/src/Services/message.ts` for the operation inventory.)
- **Components never call the client directly.** They consume a **TanStack Query** hook from `lib/queries/` (reads) or `lib/mutations/` (writes). The Query cache is the single source of truth for server entities; socket events write into it (see `03-websocket-events.md` / `10-state-and-realtime.md`).
- **Query keys are centralized and structured** — `["threads"]`, `["thread", topicId, "messages"]`. Never inline ad-hoc key arrays at call sites.
- **Mutations supply `refId` (UUID).** The backend dedupes messages on `(userId + refId)`, so retries must reuse the same `refId` — generate it once when composing, not per attempt. See `06-feature-chat.md`.
- **A conversation is N per-user `Thread` docs sharing one `topicId`.** Key message queries by `topicId`, not by a single thread id. See `05-data-models.md`.
- **The BFF is the only place that injects the Bearer token.** Browser requests hit Next Route Handlers (`app/api/...`) which read the httpOnly cookie and forward `Authorization: Bearer <jwt>` (`JWT-auth`) to the backend; alternatively the client sends through a server proxy. Do not store JWTs in JS-readable storage. The one JS-readable token is the short-lived socket-handshake token from `GET /api/auth/socket-token`. See `04-auth-sessions-deviceid.md`.
- **Realtime gotchas to honor in socket hooks** (full detail in `03-websocket-events.md`): transports are `['websocket']` only; the handshake token goes in `auth`; on **join**, the server emits an event whose **name equals the room name** (`io.in(room).emit(room, ...)`), so register a listener keyed by the exact room you joined; presence is **symmetric-privacy** (a user with `showOnlineStatus=false` neither sends nor receives presence).

## 6. Error & loading conventions

Use the App Router's built-in files; do not hand-roll global spinners or try/catch-render-fallback patterns.

- **`loading.tsx`** per route segment for the route-level pending state (wraps the segment in a Suspense boundary automatically).
- **`error.tsx`** per segment for render/runtime errors. It is a Client Component (`"use client"`), receives `{ error, reset }`, and must offer a retry via `reset()`. Add a top-level `app/error.tsx` and `app/global-error.tsx` as a backstop.
- **`not-found.tsx`** for 404 / missing-resource states; call `notFound()` from a Server Component to trigger it.
- **`<Suspense>`** for finer-grained streaming inside a page (e.g. message list streams while the composer renders immediately).
- **Data-layer errors stay typed.** TanStack Query exposes `isError` / `error`; surface them in the consuming component (inline error + retry), and reserve `error.tsx` for unexpected throws. Map backend validation errors: the API returns `400` with a body shaped `[{ field: message }]` (`backend/src/main.ts` lines 56-69) — parse that into form-field errors for react-hook-form rather than showing a raw blob.
- **Optimistic mutations roll back on error** via TanStack's `onError` + `onSettled` (relevant for send/react/edit). See `06-feature-chat.md`.

## 7. Environment variables

Next.js inlines only vars prefixed **`NEXT_PUBLIC_`** into the browser bundle. Everything else is server-only (Route Handlers / Server Components). **Secrets must never carry the `NEXT_PUBLIC_` prefix.**

Client-exposed (safe to ship to the browser):

| Var | Purpose | Source / note |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | REST origin; client appends `/api/v1` | Mirrors RN `Config.API_URL` (`frontend/src/Constants/api.ts`) |
| `NEXT_PUBLIC_WS_URL` | Socket.IO origin for the gateway handshake | Mirrors RN `Config.SOCKET_URL` |
| `NEXT_PUBLIC_AGORA_APP_ID` | Agora Web SDK app id for voice/video | Mirrors RN `Config.AGORA_APP_ID`; the Agora **token** comes from the backend, never hard-coded |

Server-only (no `NEXT_PUBLIC_` prefix — never reaches the client):

| Var | Purpose |
| --- | --- |
| `AUTH_COOKIE_SECRET` | Signing/encryption secret for the httpOnly token cookies set by the BFF |
| `AUTH_COOKIE_NAME` | (optional) cookie name override for the access/refresh token cookies |
| `API_INTERNAL_BASE_URL` | (optional) server-to-backend origin if it differs from the public one |
| `OPENAPI_BASIC_AUTH` | (build-time, optional) creds to pull `/docs-json` when regenerating the client |

Rules:

- Set cookies with `httpOnly`, `Secure`, `SameSite` from Route Handlers; **never** expose the JWT to JS. The only JS-readable token is the short-lived socket-token returned by `GET /api/auth/socket-token`.
- Commit a `.env.example` listing every var (no values). Real values live in `.env.local` (git-ignored).
- Access env vars by their full literal name (`process.env.NEXT_PUBLIC_API_BASE_URL`) so Next can statically inline them — do not build the key dynamically.
- Validate required env at startup (a small Zod schema in `lib/env.ts`) and fail fast with a clear message.

## 8. Testing

Follow the bundled Next.js guides under `node_modules/next/dist/docs/01-app/02-guides/testing/` (`index.md`, `vitest.md`, `playwright.md`). Key constraint from those docs: **async Server Components are not unit-testable yet — use E2E for them.**

**Vitest + React Testing Library — unit / component tests.**

- Install (dev): `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths`.
- `vitest.config.mts` uses `plugins: [tsconfigPaths(), react()]` and `test: { environment: 'jsdom' }`. `tsconfigPaths()` is required so `@/*` resolves in tests.
- Scope: pure functions/utils in `lib/`, custom hooks, Zustand store reducers, Zod schemas, and **synchronous** client components (rendering, props, events).
- Colocate as `*.test.ts(x)` next to the unit, or under `__tests__/`. Add `"test": "vitest"` to `package.json` scripts.
- Mock the network at the client boundary (mock `apiClient` / the socket), not deep internals. Wrap query-hook tests in a fresh `QueryClientProvider`.

**Playwright — end-to-end flows.**

- Install via `npm init playwright`; it adds `playwright.config.ts`. Set `baseURL` so tests use `page.goto('/')`.
- Run against the production build (`next build` + `next start`) per the docs, or let Playwright's `webServer` boot it.
- **Required E2E coverage** (the parity-critical flows): auth (login → cookie set by BFF → authenticated redirect), chat (open a conversation, send a message, receive it live over the socket, dedupe on `refId`), and a calls smoke test (join channel; note: incoming calls only work while the tab is open — no background push, see `08-feature-calls.md`).
- Keep secrets out of specs; seed a test account via env. CI runs headless (`npx playwright install-deps`).

## 9. Linting

- ESLint **flat config** in `eslint.config.mjs`, composing `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` with `globalIgnores([".next/**","out/**","build/**","next-env.d.ts"])`. This is the source of truth — extend it here, do not add a legacy `.eslintrc`.
- Run with `npm run lint` (`"lint": "eslint"`). **Zero warnings on `main`**; treat the existing rules (no `any`, exhaustive-deps, no unescaped entities, etc.) as blocking.
- Do not disable rules inline to dodge a real issue. If a disable is truly warranted, scope it to one line with a justification comment.
- Formatting: keep diffs clean and consistent; if Prettier is added, it formats and ESLint lints (don't duplicate formatting rules in ESLint).

## 10. Commit hygiene

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, optionally scoped — e.g. `feat(chat): live message dedupe on refId`. Matches the backend history (`fix(auth): ...`, `fix(ops): ...`).
- **Small, focused commits**; one logical change each. Don't mix a refactor with a feature.
- **Green before commit**: `npm run lint`, `npm run build` (type-check), and `vitest` must pass locally.
- **Do not commit the generated OpenAPI client by editing it** — regenerate it from the spec and commit the regenerated output as a discrete commit (`chore(api): regen client`).
- **Never commit secrets** (`.env.local`, tokens, `/docs-json` creds). Keep `.env.example` current.
- Branch off `master`; open a PR — never push directly to `master`. Keep PRs reviewable in scope.
- Don't commit `.next/`, `node_modules/`, or build output (already git-ignored).

---

### Cross-references

- `05-data-models.md` — entity shapes (`Thread`, `topicId`, message fields).
- `03-websocket-events.md` — socket handshake, room/event naming quirk, presence privacy.
- `06-feature-chat.md` — `refId` idempotency, optimistic send/edit/react.
- `10-state-and-realtime.md` — TanStack Query cache vs Zustand split.
- `04-auth-sessions-deviceid.md` — httpOnly cookies, socket-token route, token injection.
- `08-feature-calls.md` — Agora wiring and the tab-open-only incoming-call constraint.
