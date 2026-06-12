# Implementation Plan

## Overview

Inkrementelle Umsetzung des Wochenjournal-Generators: zuerst die nicht-visuellen
Bausteine (Typen, Prompts, Claude-Helper, Route, Zusammensetzung, Storage), dann
Styling und Komponenten, anschliessend die Integration in `page.tsx`, zuletzt
Umgebung, Hooks und Verifikation. Stack ist Next.js 16, React 19, Tailwind v4,
TypeScript strict.

## Tasks

- [x] 1. Grundgerüst: Typen, Konstanten und Datums-Helper
  - `types/journal.ts` mit `Weekday`, `DayEntry`, `WeekJournal`, `GenerateRequest`
    und der `WEEKDAYS`-Konstante anlegen
  - `lib/date.ts` mit `getCurrentWeek()` (ISO-Kalenderwoche) anlegen
  - Mit `npx tsc --noEmit` prüfen, dass alles typt
  - _Requirements: 1.1, 7.8_

- [x] 2. Prompt-Modul (`lib/prompt.ts`)
  - `SYSTEM_PROMPT_DAY` (ein sachlicher Absatz, kein Wochentags-Präfix, Schweizer
    Hochdeutsch, keine erfundenen Details) definieren
  - `SYSTEM_PROMPT_REFLECTION` mit exakt den vier Überschriften und der Anweisung,
    Fortschritte gegenüber Vorwochen-Kontext zu benennen, definieren
  - `buildDayPrompt(req)` und `buildReflectionPrompt(req)` implementieren
    (Reflexion: Tagesabsätze + abgegrenzter Vorwochen-Kontextblock)
  - _Requirements: 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 3. Claude-Helper (`lib/claude.ts`)
  - `@anthropic-ai/sdk` als Dependency installieren
  - `streamCompletion(system, user, maxTokens)` implementieren: Client aus
    `process.env.ANTHROPIC_API_KEY`, `messages.stream`, Text-Deltas als
    `ReadableStream<Uint8Array>` zurückgeben, Stream-Fehler an `controller.error`
  - Model aus `process.env.ANTHROPIC_MODEL` mit Default `claude-sonnet-4-6`
  - _Requirements: 8.2, 8.3, 8.5, 11.4_

- [x] 4. Route Handler (`app/api/generate/route.ts`)
  - POST-Handler mit `runtime = "nodejs"` und `dynamic = "force-dynamic"`
  - Request parsen, je `mode` den passenden Prompt-Builder wählen
  - Validierung: Tag → `stichworte` nicht leer; Reflexion → mind. ein Tagesabsatz;
    sonst HTTP 400
  - Stream als `text/plain; charset=utf-8` zurückgeben, Fehler → HTTP 500
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1_

- [x] 5. Journal-Zusammensetzung (`lib/journal.ts`)
  - `composeJournal(week)` implementieren: Header (KW/Jahr, Lernender, Betrieb,
    Ausbildungsjahr) + Tagesabsätze Mo–Fr (leere Tage → "–") + Reflexionsblock
  - Reflexionsblock weglassen, solange `reflexion` leer ist
  - _Requirements: 6.1, 6.5, 4.5_

- [x] 6. Storage-Modul (`lib/storage.ts`)
  - `loadWeeks`, `saveWeek` (Upsert nach `id`, `updatedAt` setzen, sortieren,
    auf 10 begrenzen), `deleteWeek`, `findWeek`, `previousWeeks` implementieren
  - Alle Funktionen SSR-sicher (`typeof window`-Check), Fehler still abfangen
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8_

- [x] 7. Styling-Grundlage (`app/globals.css`, `app/layout.tsx`)
  - SBB-Theme-Tokens via `@theme` ergänzen, Dark-Mode-Snippet entfernen
  - `layout.tsx`: Metadaten (Titel/Beschreibung auf Deutsch) und Seitenhintergrund
    anpassen
  - _Requirements: 10.4, 10.7_

- [x] 8. Komponente `WeekSelector.tsx`
  - KW (1–53) und Jahr als Zahl-Inputs, `onChange`-Callback
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 9. Komponente `DayCard.tsx`
  - Stichwort-Textarea, Button "Tag generieren" (deaktiviert wenn leer oder
    `generating`), Streaming-Anzeige mit blinkendem Cursor, danach editierbarer
    Absatz
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 5.1, 10.6_

- [x] 10. Komponente `ReflectionPanel.tsx`
  - Button "Reflexion generieren", Hinweis wenn keine Tagesabsätze vorhanden,
    Hinweis auf einbezogene Vorwochen, Streaming-Anzeige, danach editierbar
  - _Requirements: 3.1, 3.5, 5.2, 10.6_

- [x] 11. Komponente `JournalPreview.tsx`
  - Vorschau des `composeJournal`-Ergebnisses (read-only)
  - "Kopieren" (Clipboard + 2 s "✓ Kopiert!") und "Download .txt"
    (`arbeitsjournal-kw{kw}-{jahr}.txt`)
  - _Requirements: 6.2, 6.3, 6.4, 10.5_

- [x] 12. Komponente `HistoryPanel.tsx`
  - Liste der Wochen ("KW/Jahr" + `updatedAt` als `de-CH`), Klick lädt Woche,
    Lösch-Icon entfernt Woche, Hinweis bei leerem Verlauf
  - _Requirements: 7.4, 7.5, 7.6_

- [x] 13. Hauptseite `app/page.tsx` (Integration)
  - Zentraler State (`week`, `weeks`, `generating`, `error`), Laden aus Storage
    beim Mount, aktive Woche aus KW/Jahr ableiten
  - `generateDay(weekday)` und `generateReflection()` mit fetch + Reader-Loop,
    Schreiben ins Zielfeld, Auto-Save, parallele Requests blockieren
  - Bearbeitungen persistieren, Fehler-Banner anzeigen
  - Zweispaltiges Desktop-Layout / einspaltiger Mobile-Flow zusammensetzen
  - _Requirements: 1.1, 2.5, 3.6, 5.3, 6.1, 7.2, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

- [x] 14. Umgebungsvariablen
  - `.env.local` mit `ANTHROPIC_API_KEY=` anlegen (nicht versioniert) und prüfen,
    dass `.gitignore` `.env*` abdeckt
  - _Requirements: 8.2, 11.5_

- [x] 15. Kiro Hooks anlegen
  - `validate-prompt-structure` (fileEdited auf `lib/prompt.ts`): prüft die vier
    Reflexions-Überschriften und die Schweizer-Hochdeutsch-Regel
  - `sync-types-on-api-change` (fileEdited auf `lib/claude.ts`,
    `app/api/generate/route.ts`): prüft `types/journal.ts` auf Synchronität
  - _Requirements: 12.1, 12.2_

- [x] 16. Verifikation
  - `npm run lint`, `npx tsc --noEmit`, `npm run build` ohne Fehler
  - Manueller Durchlauf: Woche wählen → mehrere Tage generieren/bearbeiten →
    Reflexion generieren → Vorschau prüfen → Kopieren/Download → Verlauf → Reload
  - _Requirements: 11.1, 11.2_

- [x] 17. Umstellung KI-Anbieter auf Google Gemini

- [x] 17.1 SDK tauschen
  - `@anthropic-ai/sdk` deinstallieren, `@google/genai` installieren
  - _Requirements: 8.2, 11.4_

- [x] 17.2 `lib/claude.ts` → `lib/ai.ts` umstellen
  - Datei umbenennen, `streamCompletion(system, user, maxTokens)` beibehalten
  - Innereien auf `GoogleGenAI` + `generateContentStream` umstellen: `system`
    via `config.systemInstruction`, `config.maxOutputTokens`, Chunks über
    `chunk.text` enqueuen; Key aus `process.env.GEMINI_API_KEY`, Modell aus
    `GEMINI_MODEL` (Default `gemini-2.5-flash`)
  - Import in `app/api/generate/route.ts` anpassen
  - _Requirements: 8.2, 8.3, 8.5_

- [x] 17.3 Env umstellen
  - `.env.local`: `GEMINI_API_KEY` setzen; `.env.example` aktualisieren
    (GEMINI_API_KEY, optional GEMINI_MODEL)
  - _Requirements: 8.2, 11.5_

- [x] 17.4 Steering aktualisieren
  - `tech.md` auf Gemini umschreiben; `anthropic-streaming.md` →
    `gemini-streaming.md` (fileMatch auf `lib/ai.ts`) mit korrektem
    `generateContentStream`-Muster
  - Hook `sync-types-on-api-change` Patterns auf `lib/ai.ts` anpassen
  - _Requirements: 12.2_

- [x] 17.5 Verifikation mit Gemini
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`
  - Dev-Server: echter Streaming-Durchlauf für Tag und Reflexion mit
    `GEMINI_API_KEY`
  - _Requirements: 8.3, 11.1_

## Task Dependency Graph

Tasks innerhalb derselben "wave" können parallel bearbeitet werden; jede wave
hängt von den vorherigen ab.

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "5", "6", "7"] },
    { "wave": 3, "tasks": ["4", "8", "9", "10", "11", "12"] },
    { "wave": 4, "tasks": ["13"] },
    { "wave": 5, "tasks": ["14", "15"] },
    { "wave": 6, "tasks": ["16"] },
    { "wave": 7, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5"] }
  ]
}
```

Erläuterung der wichtigsten Abhängigkeiten:

- Task 1 (Typen/Datum) ist Basis für alles Weitere.
- Task 4 (Route) braucht 2 (Prompts) und 3 (KI-Helper).
- Tasks 8–12 (Komponenten) brauchen 1, 5, 6.
- Task 13 (Integration) braucht 4, 5, 6 und 8–12.
- Task 16 (Verifikation) braucht 13, 14, 15.
- Task 17 (Gemini-Umstellung) baut auf dem fertigen Stand auf; 17.2 braucht 17.1,
  17.5 braucht 17.2–17.4.

## Notes

- Vor jedem Next.js-spezifischen Schritt bei Unsicherheit die gebündelten Docs in
  `node_modules/next/dist/docs/` konsultieren (siehe `AGENTS.md`).
- Der KI-API-Key (`GEMINI_API_KEY`) bleibt strikt serverseitig (nur `lib/ai.ts` /
  Route Handler), nie im Client.
- Kein Test-Framework vorgesehen; Verifikation erfolgt über lint/tsc/build und
  einen manuellen Durchlauf.
- Nach grösseren Schritten den Stand zeigen (gemäss Steering/Briefing).
