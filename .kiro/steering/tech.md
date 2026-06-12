# Technik – Wochenjournal-Generator

## Stack (real installiert)

| Bereich      | Technologie                                          |
|--------------|------------------------------------------------------|
| Framework    | Next.js **16.2.9** (App Router)                      |
| Runtime      | React **19**                                         |
| Sprache      | TypeScript **5** (strict)                            |
| Styling      | Tailwind **v4** (`@import "tailwindcss"` + `@theme`) |
| KI           | Google Gemini API (kostenloser Tier), Modell `gemini-2.5-flash`, Streaming |
| SDK          | `@google/genai`                                      |
| Storage      | Browser `localStorage`                               |
| Package Mgr  | npm                                                  |

> **Wichtig:** Das ursprüngliche Briefing nannte Next.js 14. Installiert ist
> Next.js **16**. Immer gegen die real installierten Versionen arbeiten. Die
> APIs/Konventionen unterscheiden sich von älteren Versionen – bei Unsicherheit
> die gebündelten Docs in `node_modules/next/dist/docs/` lesen (siehe
> `AGENTS.md`), inkl. Deprecation-Hinweisen.

## Befehle

- Dev-Server: `npm run dev` (nicht vom Agent als Blocking-Command starten)
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`

## Projektstruktur (Soll)

```
app/
  api/generate/route.ts   ← POST, mode "day" | "reflection", Streaming
  page.tsx                ← Hauptseite, zentraler UI-State
  layout.tsx              ← Root Layout
  globals.css             ← Tailwind v4 + SBB-Theme-Tokens
components/
  WeekSelector.tsx  DayCard.tsx  ReflectionPanel.tsx
  JournalPreview.tsx  HistoryPanel.tsx
lib/
  ai.ts        ← Gemini-Aufruf, liefert Text-Stream
  prompt.ts    ← System-Prompts + Builder
  journal.ts   ← composeJournal(): Woche → Journaltext
  storage.ts   ← localStorage lesen/schreiben/löschen
  date.ts      ← getCurrentWeek()
types/
  journal.ts   ← Weekday, DayEntry, WeekJournal, GenerateRequest
```

## Architektur-Konventionen

- **Streaming**: Server iteriert über die Gemini-Text-Chunks (`chunk.text`) und
  gibt einen
  reinen `text/plain`-`ReadableStream` zurück (kein SSE-Parsing im Client). Der
  Client liest per `reader.read()` und hängt Chunks ans Zielfeld an
  (Tagesabsatz oder Reflexion).
- **Route Handler**: Web-`Request`/`Response`, `runtime = "nodejs"` (SDK),
  `dynamic = "force-dynamic"` (nie cachen).
- **State**: zentral in `app/page.tsx` (Client Component); Kinder erhalten Werte
  und Callbacks. Nur `lib`-Module sprechen mit `localStorage`.
- **Persistenz**: Wochen als Array unter `wochenjournal_weeks`, max 10, Auto-Save
  bei jeder Änderung. Alle Storage-Funktionen SSR-sicher (`typeof window`-Check)
  und fehlertolerant.
- **Prompts**: ausschliesslich in `lib/prompt.ts`. Zwei System-Prompts
  (`SYSTEM_PROMPT_DAY`, `SYSTEM_PROMPT_REFLECTION`) plus Builder.
- **Typen**: `types/journal.ts` ist die Quelle der Wahrheit für API-Request/
  -Response und muss synchron gehalten werden.

## Sicherheit

- `GEMINI_API_KEY` **nur** serverseitig via `process.env` (Route Handler /
  `lib/ai.ts`). Nie mit `NEXT_PUBLIC_`-Präfix, nie im Client-Bundle, nie ins
  Log schreiben.
- `.env.local` mit `GEMINI_API_KEY=`; optional `GEMINI_MODEL` (Default
  `gemini-2.5-flash`). Nicht versionieren (`.gitignore` deckt `.env*` ab).
- `/api/generate` hat keine Authentifizierung. Für ein rein lokales Tool ok – bei
  öffentlichem Deployment ungeschützt (fremde API-Kosten möglich), dann
  Zugriffsschutz ergänzen.

## Konventionen & Stil

- TypeScript strict; keine `any`-Schnellschüsse.
- Keine neuen Dependencies ausser `@google/genai`.
- Bestehenden Code-Stil übernehmen; chirurgische Änderungen (siehe
  `guidelines.md`).
- Nach Code-Änderungen verifizieren: `npm run lint`, `npx tsc --noEmit`, bei
  Bedarf `npm run build`.
- Kein Test-Framework vorgesehen; Verifikation manuell + lint/tsc/build.
