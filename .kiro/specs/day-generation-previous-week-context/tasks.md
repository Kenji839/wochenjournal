# Implementation Plan: Day-Generation Previous-Week Context

## Overview

Die Umsetzung erfolgt chirurgisch über die fünf im Design benannten Stellen, in
einer Reihenfolge, die das Typ-Fundament zuerst legt und dann von der reinen
Logik (Storage, Prompt) nach aussen zur Verdrahtung (API, Client) wandert. Jeder
Schritt baut auf dem vorigen auf und endet integriert – kein verwaister Code.

Sprache: TypeScript (strict), wie im Design. Tests mit Vitest (`npm run test` →
`vitest run`) und fast-check (beide bereits vorhanden, keine neuen
Abhängigkeiten). Property-Tests laufen mit mindestens 100 Iterationen und tragen
einen Tag im Format
`Feature: day-generation-previous-week-context, Property {N}: ...`.

Verifikation nach Code-Änderungen: `npm run lint`, `npx tsc --noEmit`,
`npm run test`, bei Bedarf `npm run build`.

## Tasks

- [x] 1. Request-Typ um Vorwochen-Kontext erweitern (Quelle der Wahrheit)
  - [x] 1.1 `GenerateRequest`-Modus `"day"` erweitern
    - In `types/journal.ts` den `"day"`-Zweig um das verpflichtende Feld
      `previousWeekDays: { weekday: Weekday; text: string }[]` ergänzen
    - Feld als immer vorhanden dokumentieren (leere Liste statt `null`/weglassen)
    - Modi `"reflection"` und `"revise"` unverändert lassen
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. Vorwochen-Tagesabsätze im Storage_Module bereitstellen
  - [x] 2.1 Reine Funktion `previousWeekDays` implementieren
    - In `lib/storage.ts` neue Funktion
      `previousWeekDays(weeks, kw, jahr): { weekday: Weekday; text: string }[]`
    - Rang-Logik `jahr * 100 + kw` wie bei `previousWeeks` wiederverwenden,
      genau die eine Woche mit grösstem Rang unter `rang(w) < grenze` wählen
      (kleinste Differenz, Jahresgrenze KW 53 → KW 1), nie die aktuelle Woche
    - Aus der gewählten Vorwoche die `days` mit `text.trim() !== ""` in
      Mo–Fr-Reihenfolge (WEEKDAYS) auf `{ weekday, text }` abbilden
    - Bei fehlender Vorwoche oder ohne nicht-leere Tagesabsätze `[]` zurückgeben
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.2 Property-Test für Vorwochenauswahl schreiben
    - In `lib/storage.test.ts`
    - **Property 1: Vorwoche ist die chronologisch nächstgelegene frühere Woche**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Generatoren: `WeekJournal[]` mit zufälligen `kw`/`jahr` (inkl.
      Jahresgrenzen, Duplikate, leere Liste) und zufällige aktuelle `(kw, jahr)`;
      mind. 100 Iterationen

  - [ ]* 2.3 Property-Test für Tagesabsatz-Extraktion schreiben
    - In `lib/storage.test.ts`
    - **Property 2: Extrahierte Tagesabsätze sind die nicht-leeren Mo–Fr-Tage der Vorwoche**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - Generatoren: Vorwoche mit zufälligen `days` inkl. reiner Whitespace-/
      Leer-Texte; prüft Filter, Mo–Fr-Reihenfolge, max. 5 Einträge,
      weekday-Zuordnung, unveränderten Text, Null-Fall; mind. 100 Iterationen

- [x] 3. Vorwochen-Kontext in den Tages-Prompt einbinden
  - [x] 3.1 `buildDayPrompt` und `SYSTEM_PROMPT_DAY` erweitern
    - In `lib/prompt.ts` `buildDayPrompt` so anpassen, dass bei mindestens einem
      nicht-leeren Eintrag in `req.previousWeekDays` ein durch `---` und
      Überschrift abgegrenzter Kontextabschnitt angehängt wird (Format je Eintrag
      `${weekdayLabel(weekday)}: ${text.trim()}`), analog zu
      `buildReflectionPrompt`
    - Bei leerem/nur-Whitespace-Kontext keinen Abschnitt erzeugen; Wochentag und
      getrimmte Stichworte bleiben unverändert führend
    - `SYSTEM_PROMPT_DAY` um Anweisungen ergänzen: Kontext nur für
      Anschluss/Übergang nutzen, nichts erfinden oder wörtlich wiederholen,
      Grundlage bleiben ausschliesslich die aktuellen Stichworte; bestehende
      Formatregeln (ein Fliesstext-Absatz, kein Präfix/Aufzählung, Schweizer
      Hochdeutsch ohne „ß“) erhalten
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 3.2 Property-Test für nicht-leeren Kontext schreiben
    - In `lib/prompt.test.ts`
    - **Property 3: Nicht-leerer Kontext erzeugt einen abgegrenzten Kontextabschnitt**
    - **Validates: Requirements 4.1, 4.3**
    - Generatoren: `day`-Request mit 1–5 nicht-leeren `previousWeekDays`,
      zufällige Stichworte/Wochentag; prüft Trennlinie/Überschrift, alle Texte,
      Wochentag-Label und getrimmte Stichworte; mind. 100 Iterationen

  - [ ]* 3.3 Property-Test für leeren Kontext schreiben
    - In `lib/prompt.test.ts`
    - **Property 4: Leerer Kontext erzeugt keinen Kontextabschnitt**
    - **Validates: Requirements 4.2, 4.6**
    - Generatoren: `day`-Request mit leerem oder nur-Whitespace
      `previousWeekDays`, zufällige Stichworte/Wochentag; prüft fehlende
      Trennlinie/Überschrift, vorhandenen Wochentag-Label und getrimmte
      Stichworte; mind. 100 Iterationen

  - [ ]* 3.4 Unit-/Beispieltests für `SYSTEM_PROMPT_DAY`-Inhalt schreiben
    - In `lib/prompt.preservation.test.ts` (Stil der bestehenden Preservation-Tests)
    - Prüft neue Anweisungen (Kontext nur für Anschluss/Übergang, nichts
      erfinden/wörtlich wiederholen) und erhaltene Formatregeln (ein Absatz, kein
      Präfix/Aufzählung, Schweizer Hochdeutsch, nur aktuelle Stichworte)
    - _Requirements: 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

- [x] 4. Checkpoint – reine Logik verifizieren
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Generate_API um das neue Feld verdrahten
  - [x] 5.1 Neues Feld durch den `"day"`-Zweig reichen
    - In `app/api/generate/route.ts` sicherstellen, dass `buildDayPrompt(body)`
      das in `body` enthaltene `previousWeekDays` mitnutzt (keine zusätzliche
      Validierung nötig)
    - Bestehende Leer-Validierung der Stichworte (400), Streaming
      (`text/plain` `ReadableStream`), Quota-Handling (429) und generischen
      Fehler (500) unverändert lassen
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

  - [ ]* 5.2 Integrationstests für die API ergänzen
    - In `app/api/generate/route.test.ts`
    - `day`-Request mit leerem und mit nicht-leerem `previousWeekDays` liefert
      jeweils denselben `text/plain`-Stream-Response; nicht-leere Stichworte
      führen mit/ohne Kontext nicht zu 400; leere Stichworte weiterhin 400
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 6. Page_Controller stellt den Vorwochen-Kontext zusammen
  - [x] 6.1 Kontext in `generateDay` ermitteln und mitsenden
    - In `app/page.tsx` vor dem Fetch `previousWeekDays(weeks, week.kw, week.jahr)`
      aufrufen (bestehenden `weeks`-State wiederverwenden, `previousWeekDays`
      importieren), mit `try/catch`-Fallback auf leere Liste
    - Das Feld `previousWeekDays` im JSON-Body des `mode: "day"`-Requests
      mitsenden; bestehenden Streaming-Empfang/-Anhänge-Fluss über `readStream`
      unverändert lassen
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 6.2_

  - [ ]* 6.2 Beispieltest für den Page-Fallback schreiben
    - In neuer `app/page.fallback.test.tsx` (oder passender Testdatei)
    - Prüft, dass bei einem Fehler aus `previousWeekDays` eine leere Liste
      gesendet und die Tagesgenerierung fortgesetzt wird
    - _Requirements: 7.4_

- [x] 7. Finaler Checkpoint – Gesamtverifikation
  - Ensure all tests pass, ask the user if questions arise.
  - `npm run lint`, `npx tsc --noEmit`, `npm run test`, bei Bedarf `npm run build`

## Notes

- Tasks mit `*` sind Test-Sub-Tasks und optional (für einen schnellen MVP
  überspringbar); Kern-Implementierungstasks sind nie optional.
- Jeder Task referenziert konkrete Requirements zur Nachverfolgbarkeit.
- Property-Tests validieren die universellen Korrektheits-Properties aus dem
  Design; Unit-/Integrationstests decken statische Prompt-Inhalte sowie API- und
  Client-Verdrahtung ab.
- Reihenfolge: Typ → Storage-Logik → Prompt-Logik → API-Wiring → Client-Wiring,
  mit Checkpoints nach der reinen Logik und am Ende.
- Keine neuen Abhängigkeiten; chirurgische Änderungen gemäss Steering (Prompts
  nur in `lib/prompt.ts`, Persistenz nur in `lib/storage.ts`, Typen als Quelle
  der Wahrheit).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.4", "5.1"] },
    { "id": 3, "tasks": ["2.3", "3.3", "5.2", "6.1"] },
    { "id": 4, "tasks": ["6.2"] }
  ]
}
```
