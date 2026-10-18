# scrabblemaster-

A browser-based Scrabble score tracker built with Next.js.

## Local development

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Render

Create a **Web Service** in Render and connect this GitHub repository. Use:

- **Branch:** `main`
- **Runtime:** Node
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`

Render will provide a public URL for the running app and can automatically
deploy future commits pushed to `main`.
