# Implementation Plan: Journal Redesign & Bearbeitung

## Overview

Der Plan setzt das Design schrittweise und chirurgisch um: von den geteilten
Typen über die reine Logik (`lib/journal.ts`, `lib/prompt.ts`, `lib/storage.ts`)
und den serverseitigen `revise`-Modus bis zur UI (`JournalPreview`, `page.tsx`)
und dem Übersichts-Layout. Jeder Schritt baut auf dem vorherigen auf und wird am
Ende verdrahtet; es bleibt kein loser, nicht integrierter Code.

Die acht Korrektheits-Eigenschaften aus dem Design werden als optionale
Property-Based-Tests nahe an der jeweiligen Implementierung umgesetzt. Im Projekt
ist noch kein Test-Framework installiert; `fast-check` käme als **Dev-Dependency**
hinzu und verletzt Requirement 9.1 (Laufzeit-Dependencies) nicht. Jeder
Property-Test wird mit `Feature: journal-redesign-edit, Property {N}` getaggt.

Bestehender Code-Stil (TypeScript strict, `@/`-Importe, deutsche UI, Schweizer
Hochdeutsch, SBB-Theme-Tokens) wird durchgehend übernommen.

## Tasks

- [x] 1. Geteilte Typen erweitern
  - [x] 1.1 `WeekJournal` und `GenerateRequest` in `types/journal.ts` erweitern
    - Optionales Feld `journalText?: string` (0–50'000 Zeichen, dokumentiert) zu `WeekJournal` hinzufügen
    - `GenerateRequest` um die Variante `{ mode: "revise"; journalText: string; anweisung: string }` ergänzen
    - Synchron zum Route Handler halten; bestehende Varianten unverändert lassen
    - _Requirements: 5.2, 6.1_

- [x] 2. Reine Überschreibungs-Logik in `lib/journal.ts`
  - [x] 2.1 Hilfsfunktionen implementieren
    - `hasManualOverride(week)`: true bei nicht-leerem `journalText` (nach Trim)
    - `displayedJournal(week)`: Überschreibung falls vorhanden, sonst `composeJournal(week)`
    - `withJournalText(week, value)`: setzt `journalText` unverändert oder entfernt es bei leerem Trim (delegiert an `withoutJournalText`)
    - `withoutJournalText(week)`: entfernt das Feld `journalText` vollständig
    - `istInhaltsleer(week)`: keine Überschreibung, kein Tagesabsatz, keine Reflexion
    - `journalFileName(week)`: `arbeitsjournal-kw{KW}-{JAHR}.txt`, KW zweistellig, Jahr vierstellig
    - `composeJournal` unverändert lassen
    - _Requirements: 2.2, 2.3, 2.4, 2.8, 2.10, 6.4, 7.1, 7.2_

  - [x]* 2.2 Testframework mit `fast-check` einrichten
    - `vitest` und `fast-check` als Dev-Dependencies hinzufügen (keine Laufzeit-Dependency)
    - Minimale Test-Konfiguration und `test`-Script in `package.json` ergänzen, `--run`-Modus (kein Watch)
    - _Requirements: 9.1_

  - [x]* 2.3 Property-Test: Override-Präzedenz
    - **Property 1: Override-Präzedenz** — `displayedJournal` liefert exakt `journalText` (nicht-leer) bzw. `composeJournal`
    - Tag: `Feature: journal-redesign-edit, Property 1`
    - **Validates: Requirements 2.2, 2.4, 6.4, 7.1**

  - [x]* 2.4 Property-Test: Überschreibungs-Lebenszyklus
    - **Property 2: Überschreibungs-Lebenszyklus** — `withJournalText`/`withoutJournalText` setzen/entfernen korrekt; nach Entfernen gilt `displayedJournal == composeJournal`
    - Tag: `Feature: journal-redesign-edit, Property 2`
    - **Validates: Requirements 2.3, 2.8, 2.10**

  - [x]* 2.5 Property-Test: Dateiname-Formatierung
    - **Property 6: Dateiname-Formatierung** — `journalFileName` liefert KW zweistellig mit führender Null, Jahr vierstellig
    - Tag: `Feature: journal-redesign-edit, Property 6`
    - **Validates: Requirements 7.2**

- [x] 3. Überarbeitungs-Prompt in `lib/prompt.ts`
  - [x] 3.1 `SYSTEM_PROMPT_REVISE` und `buildRevisePrompt()` ergänzen
    - `SYSTEM_PROMPT_REVISE` mit festem Journalformat + Wiederverwendung der gemeinsamen `REGELN`
    - `buildRevisePrompt(req)` liefert `{ system, user }` in derselben Struktur wie die bestehenden Builder
    - User-Prompt enthält den getrimmten `journalText` und die getrimmte `anweisung` verbatim
    - Kein weiterer Überarbeitungs-Prompt-Text ausserhalb von `lib/prompt.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 3.2 Property-Test: Prompt enthält getrimmte Eingaben
    - **Property 7: buildRevisePrompt enthält die getrimmten Eingaben** — `system` und `user` nicht leer; `user` enthält getrimmten `journalText` und `anweisung` als Teilstring
    - Tag: `Feature: journal-redesign-edit, Property 7`
    - **Validates: Requirements 4.2, 4.3**

- [x] 4. Persistenz mit Schreibfehler-Signalisierung in `lib/storage.ts`
  - [x] 4.1 `persist`, `saveWeek` und `deleteWeek` anpassen
    - `persist(weeks)` gibt `boolean` zurück (true bei Erfolg, false bei SSR/Quota)
    - `saveWeek` gibt bei Schreibfehler die unveränderte zuvor geladene Liste zurück (Signatur `WeekJournal[]` bleibt)
    - `deleteWeek` analog auf den `persist`-Rückgabewert umstellen, Signatur unverändert
    - `journalText` wird transparent mit (de-)serialisiert; Bestandswochen ohne Feld laden fehlerfrei
    - _Requirements: 6.2, 6.3, 6.5, 6.6_

  - [x]* 4.2 Property-Test: journalText-Persistenz-Round-Trip
    - **Property 3: journalText-Persistenz-Round-Trip** — `saveWeek`→`loadWeeks` liefert identischen `journalText`; nach `withoutJournalText` kein `journalText` mehr (In-Memory-localStorage-Mock)
    - Tag: `Feature: journal-redesign-edit, Property 3`
    - **Validates: Requirements 6.2, 6.5**

  - [x]* 4.3 Property-Test: Rückwärtskompatibles Laden
    - **Property 4: Rückwärtskompatibles Laden** — Bestandswoche ohne `journalText` lädt fehlerfrei; `hasManualOverride` false, `displayedJournal == composeJournal`
    - Tag: `Feature: journal-redesign-edit, Property 4`
    - **Validates: Requirements 6.6**

  - [x]* 4.4 Property-Test: Schreibfehler-Invarianz
    - **Property 5: Schreibfehler-Invarianz** — bei fehlschlagendem `setItem` bleibt der zuvor gespeicherte Stand unverändert und `saveWeek` liefert die vorherige Liste
    - Tag: `Feature: journal-redesign-edit, Property 5`
    - **Validates: Requirements 6.3**

- [x] 5. Checkpoint – reine Logik
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Generate-API um `revise`-Modus erweitern
  - [x] 6.1 `revise`-Zweig in `app/api/generate/route.ts` ergänzen
    - Nach dem `reflection`-Zweig `mode: "revise"` behandeln
    - 400 bei leerem `journalText` (Trim) mit Benennung des Feldes, 400 bei leerer `anweisung` (Trim) mit Benennung — jeweils ohne Gemini-Aufruf
    - `buildRevisePrompt(body)` nutzen, `MAX_TOKENS_REVISE = 4096`, `text/plain; charset=utf-8`-Streaming über bestehendes `streamCompletion`
    - Bestehende Fehlerbehandlung (unbekannter Modus → 400, Kontingent → 429, sonst → 500) und Key-nur-serverseitig unverändert nutzen
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 3.6_

  - [x]* 6.2 Property-Test: Revise-Validierung leerer Felder
    - **Property 8: Revise-Validierung leerer Felder** — `revise`-Request mit leerem `journalText` ODER leerer `anweisung` (nach Trim) → HTTP 400, benennt das Feld, kein Gemini-Aufruf
    - Tag: `Feature: journal-redesign-edit, Property 8`
    - **Validates: Requirements 5.3**

- [x] 7. Zentralen State und Handler in `app/page.tsx` erweitern
  - [x] 7.1 `revise`-Zustand und Handler ergänzen
    - `Generating`-Typ um `{ type: "revise" }` erweitern; `busy`-Guard blockt weiterhin alle Generierungen
    - `setJournalText(value)` → `commitWeek(withJournalText(week, value))`
    - `resetJournalToDerived()` → `commitWeek(withoutJournalText(week))`
    - `reviseJournal(anweisung)`: busy-/Leer-Guard, Inhaltsleer-Hinweis (`istInhaltsleer`), `displayedJournal(week)` als Original senden, `mode: "revise"` posten, Stream über bestehenden `readStream`-Helper in `journalText` aufbauen, bei Erfolg als Überschreibung speichern, bei Fehler `generating=null` + Banner, Teiltext erhalten
    - _Requirements: 2.3, 2.8, 3.3, 3.4, 3.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 8. `JournalPreview` zum kontrollierten Gesamtjournal-Bereich erweitern
  - [x] 8.1 Editor und Override-Kennzeichnung umsetzen
    - Props auf kontrolliert umstellen (`displayedText`, `isOverride`, `istLeer`, `revising`, `busy`, Callbacks `onJournalTextChange`/`onReset`/`onRevise`/`onError`)
    - `<textarea maxLength={20000}>` mit `value = displayedText`, `onChange → onJournalTextChange`; während `revising` read-only Streamdarstellung
    - Sichtbares Badge „Manuell bearbeitet", wenn `isOverride`
    - Aktion „Aus Tagesfeldern neu zusammensetzen" nur bei `isOverride`, mit zweistufiger Inline-Bestätigung (Verwerfen/Abbrechen) → `onReset` nur bei Bestätigung
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 2.9_

  - [x] 8.2 Reviser-Eingabe umsetzen
    - Einzeiliges `<input>` für die Anweisung + Button „Mit KI überarbeiten"
    - Button deaktiviert, wenn Anweisung leer ODER `busy`; Klick → `onRevise(anweisung)`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 8.3 Export auf `displayedText` umstellen
    - „Kopieren", „Download .txt" und Confluence-Upload nutzen `displayedText` statt `composeJournal(week)`
    - Download-Dateiname über `journalFileName(week)`
    - Kopieren: Erfolg → 2 s „✓ Kopiert!"; Fehler → `onError(...)`, Button-Text bleibt „Kopieren", Text erhalten
    - „Kopieren"/„Download" deaktiviert, wenn `istLeer`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Übersichts-Layout und Verdrahtung in `app/page.tsx`
  - [x] 9.1 Responsives Raster aufbauen und `JournalPreview` verdrahten
    - Tageseinträge als Raster, sodass ab 1024px alle fünf Tage gleichzeitig ohne horizontales Scrollen sichtbar sind; leere Tage bleiben als Karte und werden als leer gekennzeichnet
    - Desktop ≥1024px: Tagesraster + Reflexion + Gesamtjournal gemeinsam sichtbar; Wochenauswahl und Verlauf in der schmalen Spalte
    - <1024px: einspaltig in der Reihenfolge Wochenauswahl → Tageseinträge → Reflexion → Gesamtjournal → Verlauf
    - `JournalPreview` mit `displayedJournal`/`hasManualOverride`/`istInhaltsleer`/`revising`/`busy` und den Handlern aus 7.1 verdrahten; Vorschau reaktiv über `displayedJournal(week)`
    - Bestehendes Farbschema und deutsche UI-Texte beibehalten
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 10. Abschluss-Checkpoint und Verifikation
  - [x] 10.1 Lint und Typecheck ausführen
    - `npm run lint` → Exit-Code 0, null Errors/Warnings
    - `npx tsc --noEmit` → Exit-Code 0, null Typfehler
    - Sicherstellen, dass keine neue Laufzeit-Dependency ausser `@google/genai` hinzugekommen ist
    - _Requirements: 9.2, 9.3, 9.4, 9.1_

## Notes

- Mit `*` markierte Sub-Tasks sind optional (Property-Based-Tests) und können für ein schnelleres MVP übersprungen werden; Kern-Implementierung niemals optional.
- `fast-check` und `vitest` sind reine Dev-Dependencies und tangieren Requirement 9.1 (Laufzeit-Dependencies) nicht.
- Jeder Property-Test bildet genau eine Korrektheits-Eigenschaft ab (mind. 100 Iterationen) und liegt nahe an der Implementierung, um Fehler früh zu fangen.
- Storage-Property-Tests mocken `localStorage` als In-Memory-Implementierung; Property 8 ruft den Route-Handler mit generierten Whitespace-Eingaben ohne echten Gemini-Aufruf auf.
- Layout, Streaming-Fluss und reine UI-Interaktionen werden nicht property-getestet, sondern über lint/tsc und manuellen Durchlauf abgedeckt.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["6.1", "2.3", "3.2", "4.2"] },
    { "id": 3, "tasks": ["7.1", "2.4", "4.3", "6.2"] },
    { "id": 4, "tasks": ["8.1", "2.5", "4.4"] },
    { "id": 5, "tasks": ["8.2"] },
    { "id": 6, "tasks": ["8.3"] },
    { "id": 7, "tasks": ["9.1"] }
  ]
}
```
