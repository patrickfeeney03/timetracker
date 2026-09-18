# Work Time Tracker

A personal, server-authoritative work-time tracker built with SvelteKit 5, deployed as
a full-stack Cloudflare Worker with Static Assets, D1 and Better Auth (Google OAuth).

- **The timer lives on the server.** Closing the browser never stops or loses a
  running timer.
- **Intervals are the source of truth.** Daily totals are always derived from exact
  UTC epoch-millisecond timestamps; no daily total is ever persisted.
- **Recorded timezones are permanent.** Every session keeps the IANA timezone
  captured when it started, so travelling never moves historical work to another
  date. Sessions that cross local midnight are split at real midnight boundaries.

## Features

- `/login` — "Continue with Google" (OpenID, profile and email scopes only).
- `/` — the day's accumulating total (`HH:MM:SS`) that holds its value when paused,
  a prominent Start/Resume/Pause control, the recorded timezone and a monthly
  calendar of daily totals.
- `/history/[date]` — every session contributing to a date, with add, edit and
  delete controls at minute precision.
- Refreshes authoritative state after mutations, when the tab regains focus and
  every 30 seconds, so another device's changes appear without WebSockets.
- Failed writes never change local timer state and show an actionable retry message.
- Only one running timer per user, guaranteed by a partial unique index even when
  two devices race.

## Stack

| Concern   | Choice                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Framework | SvelteKit 5 (runes) + `@sveltejs/adapter-cloudflare`                    |
| Runtime   | Cloudflare Workers with Static Assets                                   |
| Database  | Cloudflare D1 (SQLite)                                                  |
| ORM       | Drizzle ORM + versioned SQL migrations in `drizzle/`                    |
| Auth      | Better Auth with the Google provider and the Drizzle adapter            |
| Time      | `temporal-polyfill` (midnight and DST-safe arithmetic)                  |
| Tests     | Vitest (unit + component), Wrangler/Miniflare (integration), Playwright |

## Getting started

Requirements: Node 22+, a Cloudflare account (only for deployment).

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in a secret and Google credentials
npm run db:migrate:local         # apply `drizzle/` migrations to the local D1
npm run dev                      # http://localhost:5173
```

`npm run dev` uses Wrangler's platform proxy, so the app talks to a persistent local
D1 database under `.wrangler/state` that is completely separate from production.

### Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 **Web application** client.
2. Register these authorized redirect URIs:
   - `http://localhost:5173/api/auth/callback/google` (`npm run dev`)
   - `http://localhost:4173/api/auth/callback/google` (`npm run preview` / e2e)
   - `https://<worker-name>.<account>.workers.dev/api/auth/callback/google`
   - your custom domain's `/api/auth/callback/google` if you have one
3. Put the client ID and secret in `.dev.vars`:

```dotenv
BETTER_AUTH_SECRET="..."     # openssl rand -base64 32
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

The OAuth base URL is derived from the request origin by default, so all of the hosts
above work without extra configuration. Set `BETTER_AUTH_URL` to force one base URL
(for example when running behind a proxy with a different public host).

## Testing

```bash
npm run test          # unit + component tests, then the Playwright suite
npm run test:unit     # Vitest: server, aggregation and browser component tests
npm run test:e2e      # Playwright, with its own Wrangler preview server
```

- **Unit tests** cover interval aggregation across ordinary midnights, leap days,
  month/year boundaries, positive and negative UTC offsets, skipped DST midnights,
  spring-forward/fall-back durations and record-zone stability.
- **Integration tests** (`src/lib/server/sessions/service.spec.ts`) run against a real
  D1 database in Miniflare, applying the checked-in migrations, and cover idempotent
  starts, one-active-timer races, pause semantics, overlap rejection, ownership and
  user isolation.
- **Component tests** render `LiveTimer`, `Calendar`, `SessionForm` and
  `TimerControls` in Chromium with `vitest-browser-svelte`.
- **Playwright tests** cover signed-out redirects, calendar navigation, timer
  controls, reopening the site with a running timer, multi-device focus refresh,
  network-failure recovery, loading states, midnight crossings, travel stability and
  session correction flows.

### Authenticated e2e fixture

Playwright cannot drive the real Google consent screen. Instead, the preview server is
started with `--var ENABLE_TEST_AUTH:true`, which enables
`POST /api/test-auth` to create (or reuse) a user and set a session cookie for the
test. The checked-in default is `"false"` in `wrangler.jsonc`; **never enable it in
production**.

The real Google OAuth callback should be smoke-tested manually in `npm run preview`
and after deployment.

## Deployment

1. Create the database and copy its `database_id` into `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create timetracker-db
   ```

   The placeholder UUID in the config is fine for local development only.

2. Store the secrets (never commit them):

   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

3. Apply the same versioned migrations to the remote database:

   ```bash
   npm run db:migrate        # wrangler d1 migrations apply timetracker-db --remote
   ```

4. Validate locally against the production build, then deploy:

   ```bash
   npm run build
   npm run preview           # http://localhost:4173
   npm run deploy            # wrangler deploy
   ```

Worker observability is enabled in `wrangler.jsonc`. `handleError` logs sanitized
context (status, method, path, error name/message/stack); request headers, cookies and
platform env are deliberately never logged, so OAuth and session tokens stay out of
logs.

## Data model

Better Auth's `user`, `session`, `account` and `verification` tables plus:

```ts
type WorkSession = {
	id: string;
	userId: string;
	startedAt: number; // UTC epoch milliseconds
	endedAt: number | null; // null means running
	timeZone: string; // IANA zone captured at start
	createdAt: number;
	updatedAt: number;
};
```

Indexes: `(user_id, started_at)`, `(user_id, ended_at)` and a partial unique index on
`user_id WHERE ended_at IS NULL` that guarantees at most one running timer per user.

### Timer rules

- `start` uses a server timestamp and is idempotent while a timer is running. If two
  devices race, the partial unique index lets one win and the other adopts the winner's
  session.
- `pause` updates only the authenticated user's active row using a server timestamp.
- Add/edit accept minute-level local input plus an explicit IANA timezone, and reject
  unknown timezones, non-positive durations and any overlap with another session
  (a running timer counts as open-ended). Running sessions must be paused before they
  can be edited.
- Every query derives `userId` from the authenticated session; ids coming from the
  browser are always combined with the owner check.

### Timezone behavior

- The device's current IANA zone is captured when a timer starts or a manual session
  is added, and is preserved on that session forever.
- Aggregation queries sessions whose intervals overlap the requested range (widened
  by two days on each side), then splits each interval at local midnights in its
  recorded zone and derives daily totals in server code.
- The calendar date of a session is therefore stable after travelling; day and session
  details display the recorded zone whenever it differs from the current device zone.

## Scripts

| Script                     | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `npm run dev`              | Vite dev server with the local D1 platform proxy     |
| `npm run build`            | Type-check generated bindings and build the Worker   |
| `npm run preview`          | Serve the built Worker locally with Wrangler         |
| `npm run check`            | `wrangler types --check` + `svelte-check`            |
| `npm run lint`             | Prettier + ESLint                                    |
| `npm run db:generate`      | Generate a new SQL migration from the Drizzle schema |
| `npm run db:migrate:local` | Apply migrations to the local D1 database            |
| `npm run db:migrate`       | Apply migrations to the remote production database   |
| `npm run deploy`           | Build and deploy the Worker with Wrangler            |

## Out of scope for v1

Projects/tags, multiple simultaneous timers, offline starts or pauses, reminders,
Obsidian/CSV export, team features and direct daily-total overrides.
