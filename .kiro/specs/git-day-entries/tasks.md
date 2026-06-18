# Implementation Plan: Git-Tagesstichworte (git-day-entries)

## Overview

Die Umsetzung folgt dem Modulschnitt des Designs und beginnt bei den reinen,
isoliert testbaren Funktionen (Typen → Datumslogik → Parsen/Gruppieren →
Anfügen), bevor der Route Handler und die UI verdrahtet werden. So wird die
Kernlogik früh über Property-Based-Tests (fast-check + Vitest, ≥100 Iterationen)
abgesichert, und jeder spätere Schritt baut auf bereits geprüftem Code auf.

Konventionen: TypeScript strict, Next.js 16 Route Handler (Web-`Request`/
`Response`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`), keine neuen
Dependencies (Vitest 4 und fast-check 4 sind installiert). Jeder Property-Test
trägt den Kommentar `Feature: git-day-entries, Property {N}: …` und referenziert
die geprüfte Property.

## Tasks

- [x] 1. Geteilte Typen für die Git-Zusammenfassung ergänzen
  - [x] 1.1 `GitDay` und `GitSummary` in `types/journal.ts` definieren
    - `export type GitDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday"`
    - `export interface GitSummary { week: number; year: number; days: Record<GitDay, string[]> }`
    - Benannte Exporte, bestehenden Stil/Kommentare übernehmen
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Werktagsdaten der ISO-Woche bereitstellen
  - [x] 2.1 `isoWeekWorkdays(kw, jahr)` in `lib/date.ts` implementieren
    - Liefert Mo–Fr als `{ day: GitDay; date: string }[]` (Index 0 = Montag … 4 = Freitag), `date` im Format `YYYY-MM-DD`
    - UTC-stabile Berechnung analog zu `getCurrentWeek` (Montag der ISO-Woche bestimmen, dann Mo–Fr ableiten)
    - Import `GitDay` aus `@/types/journal`
    - _Requirements: 3.3, 4.1_
  - [ ]* 2.2 Unit-Tests für `isoWeekWorkdays` schreiben (`lib/date.workdays.test.ts`)
    - Bekannte KW/Jahr-Beispiele inkl. Jahreswechsel (z. B. KW 1 und KW 53) gegen erwartete Mo–Fr-Daten prüfen
    - Reihenfolge Montag→Freitag und fünf Einträge sicherstellen
    - _Requirements: 4.1_

- [x] 3. Reine Parse- und Gruppierungslogik in `lib/git.ts`
  - [x] 3.1 `parseGitLog(raw)` implementieren
    - Zerlegt jede Zeile `"<author>\x1f<YYYY-MM-DD>\x1f<subject>"` in `{ author, date, subject }`
    - Leere Zeilen ignorieren; reine Funktion ohne git-Aufruf
    - _Requirements: 4.1, 4.2_
  - [x] 3.2 `groupByWeekday(commits, workdays, configuredAuthor)` und Konstante `GIT_DAYS` implementieren
    - Ergebnis `Record<GitDay, string[]>` mit genau fünf Schlüsseln, je (ggf. leerer) Liste
    - Exakter Datums-String-Vergleich gegen `workdays`; Sa/So und Daten ausserhalb der Woche entfallen
    - Merge-Filter (Subject beginnt mit `"Merge "`) und Author-Filter (nur bei `configuredAuthor !== null`)
    - Reihenfolge je Tag bleibt Eingabereihenfolge (chronologisch, da `--reverse` upstream)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3_
  - [ ]* 3.3 Property-Test für Ausgabe-Struktur schreiben (`lib/git.test.ts`)
    - **Property 1: Ausgabe-Struktur-Invariante**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.6, 6.3**
    - Beliebige Commit-Listen + gültige week/year → genau fünf Schlüssel monday–friday, jeweils `string[]`
  - [ ]* 3.4 Property-Test für Tagesgruppierung schreiben (`lib/git.test.ts`)
    - **Property 3: Korrekte Tagesgruppierung nach Datum**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Commits mit generierten Datumsstrings (innerhalb/ausserhalb, Sa/So) → korrekte Buckets, Wochenend-Commits entfallen
  - [ ]* 3.5 Property-Test für chronologische Reihenfolge schreiben (`lib/git.test.ts`)
    - **Property 4: Chronologische Reihenfolge je Tag**
    - **Validates: Requirements 4.4**
    - Gemischte Eingabereihenfolge → je Tag ältester zuerst
  - [ ]* 3.6 Property-Test für Author-Filter inkl. Fallback schreiben (`lib/git.test.ts`)
    - **Property 5: Author-Filter inklusive Fallback**
    - **Validates: Requirements 5.1, 5.3**
    - `configuredAuthor` ∈ {Name, null}: gesetzt → nur dessen Titel; null → alle übrigen berücksichtigten Commits
  - [ ]* 3.7 Property-Test für Merge-Ausschluss schreiben (`lib/git.test.ts`)
    - **Property 6: Merge-Commits ausgeschlossen**
    - **Validates: Requirements 5.2**
    - Subjects mit/ohne `"Merge "`-Präfix → kein Ergebnis-Titel beginnt mit `"Merge "`

- [x] 4. Orchestrierung `readGitSummary` mit Git-Aufruf in `lib/git.ts`
  - [x] 4.1 `readGitSummary(repoPath, kw, jahr)` implementieren
    - Pfad-Validierung gegen `VERBOTENE_PFADZEICHEN` (`[;|&$\`"'\n\r]`) → Leere_Antwort, kein git-Aufruf
    - `path.resolve(process.cwd(), repoPath)`; `git rev-parse --is-inside-work-tree`-Check; `git config user.name` (Fehler/leer → `null`)
    - `execFileSync("git", [...], { cwd })` ohne Shell, Werte als separate Argumente; `git log --reverse --no-merges --since --until --pretty=format:%an%x1f%ad%x1f%s --date=short`
    - `--since`/`--until` aus `isoWeekWorkdays`; Ergebnis über `parseGitLog` → `groupByWeekday`; jeder git-Aufruf in `try/catch`, im Zweifel Leere_Antwort; Helfer für Leere_Antwort
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.3, 6.1, 6.2, 6.4, 8.3_
  - [ ]* 4.2 Property-Test für Pfade mit Metazeichen schreiben (`lib/git.test.ts`)
    - **Property 7: Pfade mit Metazeichen ergeben eine Leere_Antwort**
    - **Validates: Requirements 3.4**
    - Pfade mit injizierten Shell-Metazeichen → Leere_Antwort und kein git-Aufruf (per Spion/Stub auf `child_process`)
  - [ ]* 4.3 Property-Test für nicht nutzbares Repository schreiben (`lib/git.test.ts`)
    - **Property 8: Kein nutzbares Repository ergibt eine Leere_Antwort**
    - **Validates: Requirements 3.2, 6.2**
    - Generierte metazeichenfreie Nicht-Repo-Pfade → Leere_Antwort mit unveränderten week/year
  - [ ]* 4.4 Property-Test gegen Informationsleck schreiben (`lib/git.test.ts`)
    - **Property 9: Fehlerfälle leaken keine internen Details**
    - **Validates: Requirements 6.4**
    - Fehlerfälle → serialisierte Antwort enthält weder den (absoluten) Pfad noch git-`stderr`

- [x] 5. Stichwort-Anfüge-Logik bereitstellen
  - [x] 5.1 `appendKeywords(existing, titles)` in `lib/git-keywords.ts` implementieren
    - Leere `titles` → `existing` unverändert; sonst Titel mit `\n` verbinden und (bei nicht-leerem `existing`) mit `\n` anhängen
    - `existing` bleibt als Präfix vollständig erhalten
    - _Requirements: 7.4, 7.6, 7.7_
  - [ ]* 5.2 Property-Test für das Anfügen schreiben (`lib/git-keywords.test.ts`)
    - **Property 10: Anfügen erhält bestehenden Inhalt**
    - **Validates: Requirements 7.4, 7.6, 7.7**
    - Beliebige `existing` + `titles` (inkl. leer): Ergebnis beginnt mit `existing` und enthält alle Titel; leere Liste → exakt `existing`

- [x] 6. Checkpoint – reine Logik abgesichert
  - Sicherstellen, dass alle Tests durchlaufen; bei Fragen den Nutzer einbeziehen.

- [x] 7. Route Handler `app/api/git-summary/route.ts`
  - [x] 7.1 `GET`-Handler mit Validierung und Pfad-Fallback implementieren
    - `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`
    - Query über `new URL(request.url).searchParams`; `week`/`year` zuerst validieren (Ganzzahl, 1–53 bzw. 2000–2100) → bei Verstoss HTTP 400 mit Klartextmeldung, kein git-Aufruf
    - Pfad-Fallback: `repoPath` → `process.env.GIT_REPO_PATH` → `DEFAULT_REPO_PATH = "../inclusive-app-backend"`
    - `readGitSummary` aufrufen, `Response.json({ week, year, days })` mit unveränderten week/year (auch bei Leere_Antwort)
    - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.3, 8.1_
  - [ ]* 7.2 Property-Test für week/year-Validierung schreiben (`app/api/git-summary/route.test.ts`)
    - **Property 2: Validierung von week/year**
    - **Validates: Requirements 2.2, 2.4, 2.5**
    - Ungültige week/year (out-of-range, float, fehlend) → Status 400 und kein git-Aufruf (Spion auf `readGitSummary`/`child_process`)
  - [ ]* 7.3 Beispiel-Tests für Route-Mechanik schreiben (`app/api/git-summary/route.test.ts`)
    - Fallback-Kette `repoPath` → `GIT_REPO_PATH` → Default (2.3, 8.1), HTTP 200 bei Erfolg (1.4), gesetzte `runtime`/`dynamic`-Exporte (1.5)
    - `execFileSync`-Aufruf mit Argument-Array statt Shell (3.1, per Spion)
    - _Requirements: 1.4, 1.5, 2.1, 2.3, 3.1, 8.1_

- [x] 8. Frontend-Integration
  - [x] 8.1 `components/DayCard.tsx` um Git-Lade-Button erweitern
    - Props `loadingGit: boolean` und `onLoadFromGit: () => void` additiv ergänzen
    - Sekundär-Button "Aus Git laden" neben dem Generieren-Button; deaktiviert bei `busy` oder `loadingGit`; Lade-Zustand anzeigen
    - Komponente bleibt präsentational (keine Logik)
    - _Requirements: 7.1, 7.5_
  - [x] 8.2 `app/page.tsx` verdrahten: `loadFromGit`, `WEEKDAY_TO_GITDAY`, State `loadingGit`
    - `WEEKDAY_TO_GITDAY: Record<Weekday, GitDay>` (montag→monday …); `loadingGit`-State je Wochentag
    - `loadFromGit(weekday)`: GET `/api/git-summary?week&year`, bei `!res.ok` oder leerer Liste Feld unverändert; sonst über `appendKeywords` an `setStichworte` anfügen; `try/finally` setzt `loadingGit` zurück
    - `DayCard` mit `loadingGit`/`onLoadFromGit` versorgen
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 7.7_
  - [ ]* 8.3 Beispiel-/UI-Tests für die Git-Integration schreiben (`app/page.test.tsx` oder Komponententest)
    - Button vorhanden (7.1), Klick löst GET mit korrekter KW/Jahr aus (7.2), Antwort füllt das Feld (7.3), Button während Laden deaktiviert (7.5); `fetch` gemockt
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 9. Konfiguration dokumentieren
  - [x] 9.1 `GIT_REPO_PATH` in `.env.example` mit beschreibendem Kommentar ergänzen
    - Kommentar erklärt Zweck und Default `../inclusive-app-backend`
    - _Requirements: 8.2_

- [x] 10. Abschluss-Checkpoint – Verifikation
  - `npm run lint`, `npx tsc --noEmit` und `npm test` (vitest run) ausführen und grün stellen; bei Fragen den Nutzer einbeziehen.

## Notes

- Mit `*` markierte Sub-Tasks sind optional (Tests) und können für ein schnelleres MVP übersprungen werden.
- Property-Tests laufen mit ≥100 Iterationen (`fc.assert(fc.property(…), { numRuns: 100 })`) und tragen je den Kommentar `Feature: git-day-entries, Property {N}: …`.
- Reine Logik (Typen, Datum, Parsen/Gruppieren, Anfügen) wird vor Route Handler und UI implementiert, damit Fehler früh auffallen.
- Keine neuen Dependencies: Vitest 4 und fast-check 4 sind bereits installiert.
- Jeder Task referenziert die abgedeckten Requirements bzw. die geprüfte Design-Property zur Nachverfolgbarkeit.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "9.1"] },
    { "id": 1, "tasks": ["2.1", "5.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "5.2"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["3.4"] },
    { "id": 6, "tasks": ["3.5"] },
    { "id": 7, "tasks": ["3.6"] },
    { "id": 8, "tasks": ["3.7"] },
    { "id": 9, "tasks": ["4.1"] },
    { "id": 10, "tasks": ["4.2"] },
    { "id": 11, "tasks": ["4.3"] },
    { "id": 12, "tasks": ["4.4"] },
    { "id": 13, "tasks": ["7.1"] },
    { "id": 14, "tasks": ["7.2"] },
    { "id": 15, "tasks": ["7.3"] },
    { "id": 16, "tasks": ["8.2"] },
    { "id": 17, "tasks": ["8.3"] }
  ]
}
```
