---
inclusion: fileMatch
fileMatchPattern: 'app/**'
---

# Next.js 16 – Konventionen & Stolperfallen

Es läuft **Next.js 16.2.9** (App Router), nicht Next.js 14. Bei Unsicherheit die
gebündelten Docs lesen: `node_modules/next/dist/docs/01-app/`.

## Route Handler (`app/api/**/route.ts`)

- Nutzen Web-`Request`/`Response` (Fetch-Standard), keine `req`/`res`-Objekte.
- Exportiere benannte Methoden (`export async function POST(request: Request)`).
- Route Handler werden **nicht** gecacht – ausser `GET` mit `force-static`. Für
  diesen Endpoint trotzdem explizit `export const dynamic = "force-dynamic"`.
- Streaming: ein `ReadableStream` direkt als `new Response(stream, { headers })`
  zurückgeben.
- Das Gemini-SDK (`@google/genai`) läuft serverseitig → `export const runtime = "nodejs"`
  (nicht Edge).

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  // ...
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

## Dynamische Request-APIs sind async

- `cookies()`, `headers()`, `draftMode()` und die Page-Props `params` /
  `searchParams` sind in Next 15/16 **asynchron** → mit `await` verwenden. Für
  diese App nicht zwingend nötig, aber beim Zugriff beachten.

## Client vs. Server Components

- Standardmässig sind Komponenten Server Components. Sobald `useState`,
  `useEffect`, Event-Handler, `localStorage` oder `navigator` im Spiel sind:
  `"use client"` als erste Zeile.
- `page.tsx` ist hier eine Client Component (zentraler State, Streaming-Fetch).

## Environment-Variablen

- Server-Variablen (ohne `NEXT_PUBLIC_`) sind nur serverseitig lesbar – genau so
  gewollt für `GEMINI_API_KEY`.
- Niemals `NEXT_PUBLIC_` für den API-Key verwenden (würde ins Client-Bundle
  inlined).

## Tailwind v4

- Kein `tailwind.config.js` nötig. Aktivierung via `@import "tailwindcss";` in
  `globals.css`.
- Eigene Design-Tokens als CSS-Variablen im `@theme { ... }`-Block; sie werden zu
  Utilities (`--color-sbb-red` → `bg-sbb-red`, `text-sbb-red`, `border-sbb-red`).

## Verifikation

Nach Änderungen in `app/`: `npm run lint` und `npx tsc --noEmit`; bei Bedarf
`npm run build`. Dev-Server (`npm run dev`) nicht als blockierenden Befehl
starten.
