# scrabblemaster-

A browser-based Scrabble score tracker built with Next.js.

## Local development

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Word checker configuration

The server-side word-check route uses a process-local success cache and a shared
rate-limit cooldown. These optional environment variables are milliseconds:

- `WORD_CHECK_CACHE_TTL_MS` (default `300000`)
- `WORD_CHECK_COOLDOWN_MS` (default `30000` when the provider supplies no `Retry-After`)
- `WORD_CHECK_TIMEOUT_MS` (default `8000`)

The cache is intentionally not persistent or shared between Render instances;
it reduces duplicate calls within one running instance only. Configure the same
variables in Render's Environment page if you need non-default values.

## Deploy on Render

Create a **Web Service** in Render and connect this GitHub repository. Use:

- **Branch:** `main`
- **Runtime:** Node
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`

Set any non-default `WORD_CHECK_*` variables in the service's Environment
settings, then deploy normally. No database or paid cache service is required.

Render will provide a public URL for the running app and can automatically
deploy future commits pushed to `main`.
