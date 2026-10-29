# scrabblemaster-

A browser-based Scrabble score tracker built with Next.js.

## Local development

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Halloween event theme

The Wordkeeper: Haunted Night presentation is isolated in `app/haunted-night.css` and enabled by
the `hauntedTheme` class on the app roots. To disable the event, remove its import from
`app/globals.css` and the class from `app/page.tsx` and `app/throne-room.tsx`; the game logic and
saved data are independent of the theme.

## Word checker configuration

The server-side word-check route includes the ENABLE2K dictionary in the build
and uses a process-local least-recently-used success cache (1,000 entries, five
minutes per result). These optional environment variables are milliseconds:

- `WORD_CHECK_CACHE_TTL_MS` (default `300000`)

The cache is not persistent or shared between Render instances; it only reduces
duplicate work within one running instance. The checker performs local dictionary
lookups and does not call an external service. No distributed API rate limiter is
configured. Any process-local limit would apply independently to each Render
instance and must not be treated as a multi-instance protection. A no-cost option
for small deployments is to add a per-instance request limit; for shared
multi-instance enforcement, place a rate-limiting reverse proxy or gateway in
front of the service.

Baseline security headers are configured globally. A Content Security Policy is
not enabled yet: the app's production hydration and style behavior should first
be assessed in report-only mode before enforcing a policy.

## Deploy on Render

Create a **Web Service** in Render and connect this GitHub repository. Use:

- **Branch:** `main`
- **Runtime:** Node
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`
- **Node version:** `22.22.0` (pinned in `.node-version`; supported by Next.js 16)

Set `WORD_CHECK_CACHE_TTL_MS` only if a non-default cache lifetime is needed.
No database or paid cache service is required. The packaged dictionary is
included via Next.js output file tracing at `app/data/enable2k.txt.gz`.

Render will provide a public URL for the running app and can automatically
deploy future commits pushed to `main`.
