# 14 - Setup & Running

**Purpose:** Get a frontend developer from a clean checkout to a running `unsendnext` web client against a locally-running backend, with only the env vars and services that the web client actually needs.

> Cross-links: stack/BFF rationale in `01-architecture.md`; REST base, auth and OpenAPI client usage in `02-backend-rest-api.md`; socket handshake in `03-websocket-events.md`. This file covers *how to run things*, not the contracts themselves.

---

## TL;DR (minimal happy path for chat / contacts / calls)

You do **not** need email infrastructure (WildDuck + the Python parser) to develop chat, contacts, or calls. Three Docker services + the Nest backend + the Next dev server is enough.

```bash
# 1. Infra (from backend root)
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend
docker-compose up -d            # MongoDB, Redis, RabbitMQ

# 2. Backend (NestJS) — needs a .env (see below)
npm install
npm run start:dev               # http://localhost:3000, REST under /api/v1

# 3. Web client (Next.js) — needs .env.local (see below)
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend/unsendnext
npm install
npm run dev                     # http://localhost:3000 by default — see port note below
```

> **Port clash:** both the backend (`app.listen(port || 3000)` in `backend/src/main.ts`) and `next dev` default to **3000**. Start the backend first, then run the web client on another port, e.g. `npm run dev -- -p 4000`, or set `PORT` for the backend. Keep `NEXT_PUBLIC_API_BASE_URL` pointed at the backend's port (3000), not the web app's.

---

## 1. Running the BACKEND locally

### 1.1 Infra via docker-compose

`backend/docker-compose.yml` defines exactly three services (no MongoDB/Redis auth configured, default ports):

| Service | Image | Host port | Used for |
|---|---|---|---|
| `mongodb` | `mongo:latest` | `27017` | Primary app DB (`followback`) + the WildDuck DB binding |
| `redis` | `redis:latest` | `6379` | Cache + Socket.IO Redis adapter (multi-instance fan-out) |
| `rabbitmq` | `rabbitmq:management` | `5672` (AMQP), `15672` (management UI) | Email in/out microservice queues (`incoming-emails`, `outgoing-emails`) |

```bash
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend
docker-compose up -d
docker-compose ps        # confirm all three are up
# RabbitMQ management UI: http://localhost:15672  (default guest/guest unless image overrides)
```

Note: the backend connects to RabbitMQ using `RABBITMQ_HOST` (defaults to `amqp://admin:password@localhost:5672` in `backend/src/main.ts` if unset). The stock `rabbitmq:management` image ships with `guest/guest`, so for local dev set `RABBITMQ_HOST=amqp://guest:guest@localhost:5672` (or whatever your container exposes). RabbitMQ is only exercised by the **email** path; chat/contacts/calls do not publish to it. The backend logs RMQ connect errors but keeps serving REST/WS.

### 1.2 The backend `.env`

There is a `backend/.env.example` template (it says "rename this file into `.env.prod`"; for local dev use `.env`). It has many keys; below is the subset that matters to get the server up and to support the in-scope web features. Everything else (Apple/APNs, S3, Favicon, New Relic, Sentry, dashboard/autopilot, Twilio) is optional for local chat/contacts/calls work.

| Env var | Needed for | Local value / note |
|---|---|---|
| `PORT` | HTTP listen port | `3000` (default if empty) |
| `NODE_ENV` | logging/behavior | `development` |
| `DB_URL` | Mongoose `fb` connection (`dbName: followback`) | `mongodb://localhost:27017` (consumed in `backend/src/app.module.ts`) |
| `WD_DB_URL` | Mongoose `wildduck` connection | `mongodb://localhost:27017` — required at boot even if you don't use email (the module connects on startup) |
| `REDIS_HOST` / `REDIS_PORT` | cache + Socket.IO adapter | `localhost` / `6379` (see `backend/src/adapters/redisIoAdapter.ts`, `app.module.ts`) |
| `REDIS_PASSWORD` | redis auth | leave empty for the local `redis:latest` (no auth) |
| `JWT_SECRET` | signs/verifies access tokens (REST **and** socket handshake) | any non-empty string; **must match** what the web BFF expects nothing of — the backend owns it. Used in `users/jwt.strategy.ts` and `sockets/sockets.service.ts` |
| `JWT_EXPIRE` | access-token lifetime | e.g. `15m` |
| `RABBITMQ_HOST` | email microservice transport | `amqp://guest:guest@localhost:5672` (see `main.ts`) |
| `AGORA_APP_ID` | call token issuance | your Agora app id (see `backend/src/agora/agora.service.ts`) — needed only to test calls end-to-end |
| `AGORA_APP_CERTIFICATE` | call token signing | matching Agora certificate — needed only to test calls |
| `BASIC_ATUH_ADMIN_USER` / `BASIC_ATUH_ADMIN_PASSWORD` | basic-auth guarding `/docs`, `/docs-json`, `/api/v1/system-health` | set these — **you need them to download the OpenAPI spec** (defaults in code are `unsend` / `--unsend.app%!`) |

> The variable name `BASIC_ATUH_ADMIN_USER`/`..._PASSWORD` is misspelled in the source ("ATUH"). Use it verbatim.

Email-only vars you can ignore for chat/contacts/calls work: `WILDDUCK_URL`, `PARSER_URL`, all `WILDDUCK`/quota/`imap*`/`pop3*` keys, `S3_*`/`AWS_*`/`FILE_*`, `FAVICON_*`, `TWILIO_*` (Twilio gates SMS verification at registration — you may need it for the full signup flow; for dev you can seed a verified user directly in Mongo instead).

### 1.3 Start the backend

```bash
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend
npm install
npm run start:dev      # = "STAGE=dev nest start --watch"
```

On success `main.ts` logs the URLs:

- API base: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs` (basic-auth)
- OpenAPI JSON: `http://localhost:3000/docs-json` (basic-auth)
- System health: `http://localhost:3000/api/v1/system-health` (basic-auth)

Other run scripts (from `backend/package.json`): `start:local` (`STAGE=local`), `start:debug`, `start:prod` (built `dist/`), and the `pm2:*` family (production process manager — not needed for dev).

### 1.4 What works WITHOUT email infra

| Feature domain | Works without WildDuck + parser? | Why |
|---|---|---|
| Chat (DM + group) | Yes | Mongo + Redis + Socket.IO only |
| Contacts / profile / settings | Yes | Mongo-backed REST only |
| Voice / video calls | Yes (needs Agora keys) | Agora token from `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE`; signaling over sockets |
| Email (mailbox, compose, inbound) | **No** | Requires WildDuck (`WILDDUCK_URL`) + the Python parser (`PARSER_URL`) + RabbitMQ queues |

### 1.5 (Optional) Full EMAIL stack

Email needs two extra moving parts beyond docker-compose. **Skip this unless you are working on `07-feature-email.md`.**

1. **WildDuck** — the IMAP/mail backend. The backend talks to it over HTTP at `WILDDUCK_URL` and stores mail in the `wildduck` Mongo DB (`WD_DB_URL`). Stand it up separately (its own compose/install); not bundled in `backend/docker-compose.yml`.
2. **Python parser** — a FastAPI service that cleans inbound HTML email. Lives at `c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/parser`. The backend POSTs to `${PARSER_URL}/parse` (`backend/src/email/incomingEmail.service.ts`). Run it with:

   ```bash
   cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/parser
   pip install -r requirements.txt
   uvicorn run:app --host 0.0.0.0 --port 5010 --reload
   ```

   Then set `PARSER_URL=http://localhost:5010` in the backend `.env`. (The parser also depends on a local LLM via Ollama per its `run.py`; see `parser/README.md`.)

---

## 2. Running UNSENDNEXT (the web client)

Project root: `c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend/unsendnext`.

> This is **Next.js 16** with breaking changes vs. older versions; consult the bundled docs at `unsendnext/node_modules/next/dist/docs/01-app` before adding App-Router code (per `unsendnext/AGENTS.md`).

```bash
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend/unsendnext
npm install
npm run dev                 # next dev — http://localhost:3000 by default
# Backend already owns 3000 in dev, so run the web app on another port:
npm run dev -- -p 4000
```

Scripts (from `unsendnext/package.json`): `dev`, `build`, `start` (prod server after `build`), `lint`.

### 2.1 Web app env vars (`.env.local`)

Next.js exposes only `NEXT_PUBLIC_*` vars to browser code; everything else is server-only (Route Handlers / BFF). Create `unsendnext/.env.local`:

```bash
# --- Public (browser-readable) ---
# REST base. Backend global prefix is /api/v1 (backend/src/main.ts).
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1

# Socket.IO endpoint (websocket-only). Gateway is mounted on the backend origin,
# NOT under /api/v1. Point at the backend ORIGIN. See 03-websocket-events.md.
NEXT_PUBLIC_WS_URL=http://localhost:3000

# Agora Web SDK app id (must match the backend's AGORA_APP_ID that issues tokens).
NEXT_PUBLIC_AGORA_APP_ID=<your-agora-app-id>

# --- Server-only (BFF / Route Handlers) — NEVER prefix with NEXT_PUBLIC ---
# Used to sign/encrypt the httpOnly auth cookies and the short-lived
# /api/auth/socket-token responses. See 01-architecture.md and 02-backend-rest-api.md.
AUTH_COOKIE_SECRET=<long-random-string>
```

| Var | Scope | Purpose | Source of truth |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | browser | REST calls + generated client base | `=http://localhost:3000/api/v1` (matches backend prefix) |
| `NEXT_PUBLIC_WS_URL` | browser | Socket.IO connect URL | backend origin `http://localhost:3000` (gateway is not prefixed) |
| `NEXT_PUBLIC_AGORA_APP_ID` | browser | `agora-rtc-sdk-ng` client init | must equal backend `AGORA_APP_ID` |
| `AUTH_COOKIE_SECRET` | server | sign httpOnly token cookies + socket-token route | invented by us; keep out of the client bundle |

> Naming: `AUTH_COOKIE_SECRET` is a convention chosen for `unsendnext` (the backend has no such var). If `01-architecture.md` later fixes a different name for the cookie secret, align to it — there is one source of truth for the BFF.
>
> CORS is wide open on the backend (`origin: '*'`, `credentials: true` in `main.ts`), so the web app can call it cross-origin in dev without extra config. Tokens for the browser ride in **httpOnly cookies** via the BFF, not in `localStorage`; the socket handshake uses the JS-readable token from `/api/auth/socket-token` (see `03-websocket-events.md`).

---

## 3. Generate the typed API client from `/docs-json`

The backend serves an OpenAPI document at `/docs-json` (basic-auth protected — use the `BASIC_ATUH_ADMIN_*` credentials). We generate a typed client with `openapi-typescript` (types) + `openapi-fetch` (runtime). See `02-backend-rest-api.md` for usage patterns.

```bash
cd c:/Users/Sebastian/Documents/ProiecteDeLucru/Unsend/backend/unsendnext

# one-time install
npm install -D openapi-typescript
npm install openapi-fetch

# 1) pull the spec (basic-auth). curl -u sends the credentials:
curl -u "$BASIC_ATUH_ADMIN_USER:$BASIC_ATUH_ADMIN_PASSWORD" \
  http://localhost:3000/docs-json -o openapi.json

# 2) generate types from the local file:
npx openapi-typescript ./openapi.json -o ./lib/api/schema.ts
```

PowerShell equivalent for step 1 (the dev environment here is Windows/PowerShell):

```powershell
$pair = "$env:BASIC_ATUH_ADMIN_USER`:$env:BASIC_ATUH_ADMIN_PASSWORD"
$b64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
Invoke-WebRequest -Uri "http://localhost:3000/docs-json" `
  -Headers @{ Authorization = "Basic $b64" } -OutFile "openapi.json"
```

Add a convenience script to `unsendnext/package.json` so regeneration is one command after backend changes:

```jsonc
"scripts": {
  "gen:api": "openapi-typescript ./openapi.json -o ./lib/api/schema.ts"
}
```

> **Caveat:** the Nest DTOs are loosely typed in places, so several spec fields surface as `any` (e.g. message payloads, some thread fields). Treat the generated types as a starting point and **confirm shapes against `frontend/src/Services/` and `frontend/src/Types/`** (the RN app is the authoritative parity reference). Flagged again in `02-backend-rest-api.md` and `05-data-models.md`.

---

## 4. Quick verification checklist

1. `docker-compose ps` → mongodb, redis, rabbitmq all `Up`.
2. Backend: `npm run start:dev` logs `✨ Application successfully started!` and `API Base URL: http://localhost:3000/api/v1`.
3. `curl -u <user>:<pass> http://localhost:3000/docs-json` returns JSON (auth + spec both work).
4. Web: `npm run dev -- -p 4000` serves on `http://localhost:4000`; browser network calls hit `http://localhost:3000/api/v1`.
5. Socket connects to `NEXT_PUBLIC_WS_URL` over **websocket transport only** (no polling) — see `03-websocket-events.md` for the handshake and the join-echo quirk.

---

## 5. Common gotchas

- **Both default to port 3000.** Run the web app on a different port (`-p 4000`) and keep `NEXT_PUBLIC_API_BASE_URL` on the backend's 3000.
- **`/docs-json` 401.** You forgot basic-auth, or `BASIC_ATUH_ADMIN_*` is unset (code defaults are `unsend` / `--unsend.app%!`). Note the misspelled env name `ATUH`.
- **Backend won't boot, Mongo errors.** `DB_URL` and `WD_DB_URL` are both required at startup (two Mongoose connections in `app.module.ts`); point both at `mongodb://localhost:27017` for local dev.
- **Calls fail to connect.** `NEXT_PUBLIC_AGORA_APP_ID` (web) and `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` (backend) must all be set and the app id must match.
- **Email is dark.** Expected without WildDuck + the parser running; chat/contacts/calls are unaffected.
- **Incoming call doesn't ring.** On web, calls ring only while a tab is open (no VoIP/background push — quirk #5, `08-feature-calls.md`); not a setup bug.
