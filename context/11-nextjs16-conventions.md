# 11 - Next.js 16 Conventions (unsendnext)

> Purpose: How to write Next.js 16 code in unsendnext correctly — the version-sensitive rules for a client-heavy, authenticated SPA that talks to an external NestJS backend.

## RULE 0 (READ THIS FIRST)

**Next.js 16 has breaking changes — ALWAYS read the relevant file under `node_modules/next/dist/docs/` before writing Next code.** Your training data is stale. The bundled docs in `unsendnext/node_modules/next/dist/docs/01-app/` are the source of truth. The repo `AGENTS.md` says the same thing: "This is NOT the Next.js you know."

Verified stack (from `unsendnext/package.json`, `tsconfig.json`): `next@16.2.4`, `react@19.2.4`, `react-dom@19.2.4`, TypeScript strict, Tailwind v4, ESLint 9. App Router lives at `unsendnext/app/` (no `src/` dir). Path alias `@/*` -> `./*` (so `@/lib/...` resolves from the project root, NOT from `src/`). `next.config.ts` is currently empty (`{}`).

### Which bundled doc to read for which task

| Task | Read this doc (under `node_modules/next/dist/docs/01-app/`) |
|---|---|
| Deciding server vs client component | `01-getting-started/05-server-and-client-components.md` |
| Fetching data (RSC, `use`, React Query) | `01-getting-started/06-fetching-data.md` |
| Mutations / Server Actions / cookies in actions | `01-getting-started/07-mutating-data.md` |
| Caching, `use cache`, Cache Components / PPR | `01-getting-started/08-caching.md` |
| BFF Route Handlers (`route.ts`) | `01-getting-started/15-route-handlers.md` + `02-guides/backend-for-frontend.md` |
| `proxy.ts` (was middleware) | `01-getting-started/16-proxy.md` + `02-guides/authentication.md` |
| Building a CSR SPA on App Router | `02-guides/single-page-applications.md` |
| CSP / nonce / iframe headers | `02-guides/content-security-policy.md` |
| Any "why did this break" question | `02-guides/upgrading/version-16.md` |

Cross-links: backend REST/WS contracts live in the other numbered context files (auth flow -> `04-auth-sessions-deviceid.md`; sockets -> `03-websocket-events.md`; data models -> `05-data-models.md`; calls -> `08-feature-calls.md`). This file only covers Next.js framework conventions; do not duplicate those.

---

## 1. Server vs Client Components

Layouts and pages are **Server Components by default**. Add `'use client'` at the top of a file (above imports) to make it (and everything it imports) a Client Component (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`).

For unsendnext the reality is: **most feature UI is `'use client'`.** Chat, the email reader, call UI, presence, virtualized lists, forms — all need state, effects, browser APIs (socket.io, Agora, `localStorage`, `IntersectionObserver`), and TanStack Query / Zustand hooks. None of those work in a Server Component.

Practical rules:

- Keep the **`'use client'` boundary as deep as practical** to limit bundle size. A Server Component layout can render mostly-static shell, then render Client Components (a search bar, the chat pane) inside it. You do NOT add `'use client'` to every component — only at the boundary; imports below it are automatically client.
- **React Context is not allowed in Server Components.** All our providers (QueryClientProvider, the socket provider, theme) must live in `'use client'` components, mounted as deep as possible in the tree while still wrapping `{children}` (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, "Context providers").
- Props passed Server -> Client must be **serializable**. Don't pass class instances, functions (except Server Actions), Maps with non-serializable values, etc.
- **Environment poisoning:** only `NEXT_PUBLIC_`-prefixed env vars reach the client; everything else is replaced with `''` in client bundles. Keep the backend base URL / Agora App ID public (`NEXT_PUBLIC_*`); keep any secret (basic-auth for `/docs-json`, signing secrets) server-only. Use the `server-only` package on modules that must never be bundled client-side.
- Browser-only third-party libs (Agora SDK) that touch `window`/`document` during import should be loaded with `next/dynamic` `{ ssr: false }`, or guarded behind a mounted check, to avoid prerender crashes (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`, "Rendering components only in the browser").

> We deliberately do NOT fetch unsend's server entities in Server Components. See Section 4.

## 2. Async `params` and `searchParams` (BREAKING in 16)

This is the most common 16 footgun. **`params` and `searchParams` are now Promises — synchronous access was fully removed in 16** (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, "Async Request APIs"). Same for `cookies()`, `headers()`, `draftMode()`.

```tsx
// app/conversation/[topicId]/page.tsx
export default async function Page(props: PageProps<'/conversation/[topicId]'>) {
  const { topicId } = await props.params          // await — not props.params.topicId
  const sp = await props.searchParams             // await
  return <ConversationView topicId={topicId} />   // pass to a 'use client' child
}
```

- `cookies()`, `headers()` are async too: `const token = (await cookies()).get('session')?.value`.
- In Route Handlers, dynamic params come via the context arg and are also a Promise: `const { id } = await ctx.params` with the global `RouteContext<'/users/[id]'>` helper (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
- Use the globally generated `PageProps`, `LayoutProps`, `RouteContext` helpers (run `npx next typegen` if types are missing; they regenerate on `next dev`/`next build`).
- Since most of our pages are thin wrappers that hand the resolved param to a client component, awaiting params is usually the only "server" work a page does.

## 3. The `proxy.ts` convention (was `middleware`)

**`middleware` was renamed to `proxy` in 16** (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`). The functionality is the same, but:

- File is `proxy.ts` at the project root (same level as `app/`). One per project. Export a function named `proxy` (named or default export; rename the function to `proxy` even for default exports).
- **The `edge` runtime is NOT supported in `proxy`.** `proxy` runs on the `nodejs` runtime and that is not configurable. (If you genuinely needed edge, you'd have to keep a legacy `middleware` file — out of scope here.)
- Config flags renamed: e.g. `skipMiddlewareUrlNormalize` -> `skipProxyUrlNormalize`.
- `fetch` cache options (`cache`, `next.revalidate`, `next.tags`) have **no effect** inside `proxy`.

Use `proxy` only for cheap, request-time work: setting the CSP nonce header (Section 7) and optionally an **optimistic** auth redirect (read the session cookie only; never call the backend from `proxy` — it runs on every route including prefetches) (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Optimistic checks with Proxy"). Real authorization happens in the backend on every API call.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  const path = request.nextUrl.pathname
  if (!session && path.startsWith('/app')) {
    return NextResponse.redirect(new URL('/login', request.nextUrl))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

## 4. Caching model & why we mostly opt OUT

Default behaviors in 16 (`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`, `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`):

- `fetch` is **NOT cached by default**; it blocks render until complete.
- Route Handlers are **NOT cached by default**; only `GET` can opt in (`export const dynamic = 'force-static'`), and other methods are never cached.
- **Cache Components** (`cacheComponents: true` in `next.config.ts`) enables the `use cache` directive + Partial Prerendering (PPR). `use cache` caches an async function/component output keyed by its args + closed-over values. `cacheLife`, `cacheTag` are now stable (drop the `unstable_` prefix). `dynamicIO` was renamed to `cacheComponents`; `experimental_ppr` is removed.

**unsendnext policy: the Next.js data cache is NOT our source of truth for server entities.** Unsend data (threads, messages, presence, calls) is live and per-user, written into the cache by socket events. The source of truth is the **TanStack Query cache on the client** (see `10-state-and-realtime.md` for the socket->query-cache write path). Therefore:

- Do all entity fetching **client-side** with TanStack Query v5 in `'use client'` components. The fetching/upgrade docs explicitly endorse React Query for client data and for "frequently polled data" / data behind client-only Web APIs (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md` "Caveats").
- Do NOT mirror backend endpoints with `fetch(..., { cache: 'force-cache' })` or `use cache`. There is no benefit (data is realtime + auth-scoped) and it risks serving one user's data to another.
- Our BFF Route Handlers (Section 5) are all dynamic (they read cookies / forward auth) and therefore inherently uncached — that is correct. Do not add `force-static` to them.
- If `cacheComponents` is ever turned on, any component reading runtime APIs (`cookies()`, `headers()`, `searchParams`) MUST be wrapped in `<Suspense>` or you get a build-time "Uncached data accessed outside of `<Suspense>`" error. Given our SPA shape, prefer leaving `cacheComponents` off unless there is a concrete static-shell win; revisit per `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`.

> We are NOT using Server Actions or `revalidateTag`/`updateTag`/`refresh` for unsend data mutations. Mutations go through TanStack Query mutations hitting the BFF/backend, with optimistic updates against the query cache. Note: in 16, `revalidateTag` now requires a second `cacheLife` arg (`revalidateTag('x', 'max')`) — relevant only if you ever do use Next's cache. Messages are idempotent on (userId + refId): the client supplies a `refId` UUID so retries don't duplicate — see `10-state-and-realtime.md`.

## 5. Route Handlers as the BFF

The backend is unchanged and consumed as-is (REST base `/api/v1`, Bearer JWT, WebSocket handshake-auth). The only server code we own is a **thin BFF** of Next.js Route Handlers under `app/api/...` (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`). Its single job is to keep tokens in **httpOnly Secure cookies** so the JWT is never exposed to JS, and to issue a separate JS-readable token for the socket handshake.

Conventions:

- A `route.ts` exports `GET`/`POST`/etc. using Web `Request`/`Response` (or `NextRequest`/`NextResponse`). There **cannot** be a `route.ts` at the same segment as a `page.tsx`. Unsupported methods auto-return 405; `OPTIONS` is auto-added if absent.
- Read cookies with `(await cookies()).get(...)` (async). Set httpOnly cookies on the response (`response.cookies.set({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' })`).
- Use `try/catch`; never leak backend error internals to the client (`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`, "Security").

Planned BFF routes (names are ours; confirm shapes against `frontend/src/Api/` and `frontend/src/Services/`):

| Route | Method | Job |
|---|---|---|
| `app/api/auth/login/route.ts` | POST | Forward credentials to backend `/api/v1` login; on success store access+refresh JWT in httpOnly cookies. |
| `app/api/auth/logout/route.ts` | POST | Delete the auth cookies. |
| `app/api/auth/refresh/route.ts` | POST | Use the refresh cookie to mint a new access token from the backend; rewrite cookies. Called when the client gets a 401. |
| `app/api/auth/socket-token/route.ts` | GET | Return a **short-lived, JS-readable** token (NOT the httpOnly JWT) for the socket.io handshake `auth` field. The browser cannot read the httpOnly cookie, so the socket layer fetches this on connect/reconnect. |
| `app/api/proxy/[...path]/route.ts` | ALL | Optional generic proxy: attach the cookie's Bearer token and forward to `{backend}/api/v1/{path}`. Validate before forwarding. |
| `app/api/attachments/[...path]/route.ts` | GET | Attachment/media proxy: server-side attaches the Bearer token and streams the backend file back, so `<img>`/`<a>`/iframe `src` can point at a same-origin URL without leaking the JWT in a query string. Stream the upstream `Response` body through; forward `Content-Type`/`Content-Length`. |

Caveats from the docs (`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`, "Caveats"):

- Do NOT fetch your BFF routes from Server Components (extra HTTP round trip; build-time prerender has no server listening). Our client components call them directly via `fetch`/TanStack Query, which is fine.
- Some hosts run Route Handlers as lambdas: no shared state between requests, possibly no FS writes, timeouts, and **WebSockets won't work** in a handler. Our realtime is a direct browser->backend socket.io connection, not through the BFF — keep it that way.
- When proxying, you can only read a request body once; `request.clone()` if you need it twice.

> A typed API client is auto-generated from the backend OpenAPI at `/docs-json` (openapi-typescript + openapi-fetch). Where the spec types a field as `any` (the NestJS spec is loosely typed in places), do NOT trust it blindly — confirm the real shape against `frontend/src/Types/` and `frontend/src/Services/`, and narrow with Zod at the BFF/client boundary.

## 6. Data fetching, mutations, navigation patterns we use

- **Client fetching:** TanStack Query v5 in `'use client'` components. Query cache = source of truth; socket events `setQueryData` into it (`10-state-and-realtime.md`). Reference: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` "Community libraries", `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` "SPAs with React Query".
- **The `use(promise)` / hoisted-promise pattern** (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`, `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`) is available if we ever want to start a fetch in a Server Component and unwrap it in a client child via `use()`. We generally don't need it because data is client-owned, but it's the idiomatic way to seed initial data without a waterfall if we add SSR later.
- **Server Actions are NOT our mutation path.** They're POST-only, run sequentially (queued), and are aimed at form mutations against your own backend/db. Our mutations hit the external backend via TanStack Query mutations + the BFF. (If you ever add a form that mutates Next-owned state, follow `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`: `'use server'`, `useActionState` for pending, and authorize inside every action — actions are reachable by direct POST.)
- **Forms:** react-hook-form + Zod for client validation; submit handlers call mutations. (Zod also validates inputs at the BFF boundary.)
- **Navigation / instant transitions:** use `next/link` for prefetched, instant client transitions (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`). 16 overhauled routing (layout dedup + incremental prefetch) with no code changes needed. For SPA-style URL state without a full file-system navigation (e.g. selecting a thread, sort/filter state), use native `window.history.pushState`/`replaceState` — these integrate with `usePathname`/`useSearchParams` (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`, "Shallow routing"). **Instant-navigation note:** if client transitions feel slow even with Suspense, a route can export `unstable_instant` to force instant navigations (referenced in `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` / `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` agent hints, full detail in `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.mdx`) — read that file before using it.
- Scroll: 16 no longer overrides global `scroll-behavior: smooth` on navigation. If we set smooth scrolling globally and want the old snap-to-top behavior, add `data-scroll-behavior="smooth"` to `<html>` (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`).

## 7. CSP and the email iframe

Incoming emails contain untrusted HTML. We render them sanitized with **DOMPurify inside a sandboxed `<iframe>`** (decided stack). The framework-level concern here is the **Content Security Policy**, set in `proxy.ts` (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`).

Key points from the doc:

- A **nonce-based CSP requires dynamic rendering** — it disables static optimization/ISR and **is incompatible with PPR / Cache Components**. This is another reason to keep `cacheComponents` off (Section 4). The nonce is generated per request in `proxy`, set on both the `Content-Security-Policy` and a custom `x-nonce` header; Next auto-applies it to its own scripts/styles. In dev you must add `'unsafe-eval'` (React uses `eval` for debugging); not needed in prod.
- The email body must be **isolated**, not governed by the page's script execution. Render it in an iframe with `sandbox` (omit `allow-scripts`, or use a strict allowlist) and prefer `srcdoc` with DOMPurify-sanitized HTML so it can't run scripts or navigate the top frame. CSP `frame-ancestors 'none'` protects unsendnext from being framed; to constrain what the email iframe itself can load, the iframe's own document should carry a restrictive CSP (e.g. `default-src 'none'; img-src ...; style-src 'unsafe-inline'`) plus the `sandbox` attribute. Inline email styles are expected, so the iframe (not the app) is where `'unsafe-inline'` for styles lives — keep it inside the sandbox, never on the main document.
- Add to the **app** CSP any origins the client must reach: `connect-src` for the backend REST origin, the WebSocket origin (`wss:`), and Agora endpoints; `img-src`/`media-src` for the attachment proxy (same-origin `'self'`) and any avatar/CDN host; `frame-src` if the email iframe uses a real URL rather than `srcdoc`. Build this list against what the RN app actually contacts (`frontend/src/Services/`, `frontend/src/Api/`).
- If a strict nonce CSP proves too costly, the doc offers a non-nonce CSP via `next.config` `headers()` (allows static rendering) or experimental SRI; choose deliberately and document the trade-off.

## 8. Other 16 breaking changes to keep in mind

From `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (read it before touching config/build):

- **Turbopack is the default** for `next dev` and `next build`. A custom `webpack` config makes `next build` fail unless you pass `--webpack` or migrate to `turbopack` options. `experimental.turbopack` moved to top-level `turbopack`.
- **`next lint` is removed** and `next build` no longer lints. Run ESLint (flat config) directly — matches our `"lint": "eslint"` script. `@next/eslint-plugin-next` defaults to flat config.
- **`serverRuntimeConfig` / `publicRuntimeConfig` removed** — use env vars (`NEXT_PUBLIC_` for client). To read env at runtime (not bundled at build), call `await connection()` before `process.env` access.
- **Parallel route slots require an explicit `default.js`/`default.tsx`** or the build fails.
- `next/legacy/image` and `images.domains` deprecated (use `images.remotePatterns`); several `next/image` defaults tightened (`minimumCacheTTL` 60s->4h, `qualities` -> `[75]`, local images with query strings need `images.localPatterns.search`, local-IP optimization blocked by default). Relevant if we ever route avatars/media through `next/image` instead of the raw attachment proxy.
- Runtime: Node 20.9+, TypeScript 5.1+.

## 9. Minimal checklist before writing Next code

1. Did you read the matching doc from the table in RULE 0? If not, read it.
2. Does this component need state/effects/browser APIs/hooks? -> `'use client'` at the boundary, providers in client components.
3. Touching `params`/`searchParams`/`cookies`/`headers`? -> `await` them; use the generated `PageProps`/`RouteContext` types.
4. Server-side request handling? -> it's a `route.ts` Route Handler (BFF), not `middleware`; cross-cutting request work -> `proxy.ts` (nodejs runtime, no edge).
5. Fetching unsend data? -> TanStack Query client-side; do NOT use Next's data cache / `use cache` / Server Actions for it.
6. Rendering email HTML? -> DOMPurify + sandboxed iframe, and confirm the app CSP in `proxy.ts` allows the backend/WS/Agora/attachment origins.
