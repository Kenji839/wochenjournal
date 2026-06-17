# Implementation Plan: Journal-Update-after-Edit Bugfix

## Overview

Chirurgischer Bugfix für zwei ineinandergreifende Defekte (siehe `design.md`):
- **Defekt A** – veraltete Journal-Anzeige nach gesetztem Override (Property 1,
  Preservation in Property 2).
- **Defekt B** – fehlender Reflexions-Kontext bei Neugenerierung (Property 3,
  Preservation in Property 4).

Der Plan folgt der explorativen Bugfix-Reihenfolge: zuerst beide Defekte auf dem
UNGEFIXTEN Code reproduzieren (Counterexamples sichtbar machen) und die
Baseline des zu erhaltenden Verhaltens festhalten, danach den Fix chirurgisch in
genau drei Dateien anwenden (`types/journal.ts`, `lib/prompt.ts`, `app/page.tsx`)
und schliesslich Fix- und Preservation-Checks bestätigen.

Verifikation gemäss Steering: kein verbindliches Test-Framework. Primär
`npm run lint`, `npx tsc --noEmit`, bei Bedarf `npm run build` sowie manuelle
Reproduktion im Browser. Wo mit dem vorhandenen Vitest sinnvoll (reine Funktions-/
Prompt-Tests für `buildReflectionPrompt` und `displayedJournal`), dürfen die
Explorations-/Preservation-Checks als Vitest-Tests umgesetzt werden; UI-State-
Übergänge an den Commit-Punkten in `app/page.tsx` werden manuell im Browser
geprüft. Keine Änderungen an `app/api/generate/route.ts` oder `lib/journal.ts`
(`withoutJournalText` existiert bereits).

## Tasks

- [x] 1. Bug Condition A explorativ reproduzieren (VOR dem Fix)
  - **Property 1: Bug Condition A** – Feld-Update hebt veraltete Anzeige nicht auf
  - **CRITICAL**: Dieser Check MUSS auf dem ungefixten Code FEHLSCHLAGEN – das Fehlschlagen bestätigt, dass der Bug existiert
  - **DO NOT** den Code oder Check beim Fehlschlagen reparieren
  - **GOAL**: Counterexamples sichtbar machen, die Defekt A belegen
  - **Scoped-Ansatz (deterministisch)**: Konkrete Fälle aus `isBugConditionA` herstellen – Override setzen (`setJournalText`/`reviseJournal`), dann "Montag" neu generieren (`generateDay`); Override setzen, dann Tagesabsatz im Editor ändern (`setDayText`); Override setzen, dann Reflexion neu generieren (`generateReflection`)
  - Reine Funktionsebene (mit Vitest möglich): Woche mit `journalText` bauen, `days[i].text`/`reflexion` ändern und prüfen, dass `displayedJournal(week)` weiterhin den alten Override liefert statt `composeJournal(week)`
  - Assertion entspricht der Expected Behavior aus Property 1: nach einem Feld-Update soll `displayedJournal(week') == composeJournal(week')` gelten und das Feld-Update enthalten
  - Auf UNGEFIXTEM Code ausführen
  - **EXPECTED OUTCOME**: Check FAILT (beweist den Bug)
  - Counterexample dokumentieren (z. B. "`displayedJournal` gibt den alten Override zurück, obwohl `days[0].text` aktualisiert wurde")
  - _Requirements: 1.1, 1.2_

- [x] 2. Bug Condition B explorativ reproduzieren (VOR dem Fix)
  - **Property 3: Bug Condition B** – Reflexions-Neugenerierung ignoriert bestehende Reflexion
  - **CRITICAL**: Dieser Check MUSS auf dem ungefixten Code FEHLSCHLAGEN – das Fehlschlagen bestätigt, dass der Bug existiert
  - **DO NOT** den Code oder Check beim Fehlschlagen reparieren
  - **GOAL**: Belegen, dass der Reflexions-User-Prompt die bestehende Reflexion nicht als Kontext enthält
  - **Scoped-Ansatz (deterministisch)**: `buildReflectionPrompt` mit einem `reflection`-Request mit nicht-leerer bestehender Reflexion aufrufen (mit Vitest möglich)
  - Assertion entspricht der Expected Behavior aus Property 3: `prompt.user` soll die bestehende Reflexion als abgegrenzten Kontextblock enthalten
  - Auf UNGEFIXTEM Code ausführen – `GenerateRequest` (mode "reflection") trägt kein Feld für die bestehende Reflexion, daher fehlt der Kontextblock
  - **EXPECTED OUTCOME**: Check FAILT (beweist den Bug)
  - Counterexample dokumentieren (z. B. "`buildReflectionPrompt` enthält keinen Kontextblock für die bestehende Reflexion")
  - _Requirements: 1.3_

- [x] 3. Preservation-Checks etablieren (VOR dem Fix)
  - **Property 2: Preservation A** – Anzeige ohne Override und bewusste Gesamtbearbeitung
  - **Property 4: Preservation B** – Reflexions-Erstgenerierung ohne bestehende Reflexion
  - **IMPORTANT**: Observation-first – Verhalten auf UNGEFIXTEM Code beobachten und festhalten
  - Beobachten/Festhalten (¬A): ohne Override gilt `displayedJournal(week) == composeJournal(week)` (3.1); nach `setJournalText(...)`/`reviseJournal(...)` ist `hasManualOverride(week)` true und die Anzeige zeigt den gesetzten `journalText` (3.2); `generateDay` setzt Tagesstichworte unverändert in einen Absatz um (3.4)
  - Beobachten/Festhalten (¬B): `buildReflectionPrompt` ohne `aktuelleReflexion` (Feld fehlt/leer) erzeugt exakt den bisherigen Prompt inkl. `previousWeeks`-Kontext der bis zu drei Vorwochen, ohne Kontextblock für eine bestehende Reflexion (3.3); Whitespace-only bestehende Reflexion → kein Kontextblock
  - Wo mit Vitest sinnvoll: tabellengetriebene Checks für `displayedJournal` und `buildReflectionPrompt`; UI-State (¬A in `app/page.tsx`) manuell im Browser
  - **EXPECTED OUTCOME**: Alle Preservation-Checks BESTEHEN auf ungefixtem Code (Baseline)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Fix für veraltete Journal-Anzeige und fehlenden Reflexions-Kontext

  - [x] 4.1 `types/journal.ts` – optionales Feld für die bestehende Reflexion ergänzen
    - In der `GenerateRequest`-Variante mode "reflection" `aktuelleReflexion?: string` ergänzen
    - Abwärtskompatibel halten: fehlt das Feld, bleibt die Erstgenerierung unverändert (3.3)
    - `types/journal.ts` als einzige Quelle der Wahrheit synchron halten
    - _Bug_Condition: isBugConditionB(request) aus design – Request trägt kein Feld für die bestehende Reflexion_
    - _Expected_Behavior: Property 3 – Request kann die bestehende Reflexion mitführen_
    - _Preservation: Property 4 – fehlt das Feld, ist die Erstgenerierung unverändert_
    - _Requirements: 2.3, 3.3_

  - [x] 4.2 `lib/prompt.ts` – Reflexions-Prompt um bestehende Reflexion erweitern
    - `buildReflectionPrompt`: wenn `req.aktuelleReflexion?.trim()` nicht leer ist, einen klar abgegrenzten Kontextblock "Bestehende Reflexion (als Ausgangsbasis, manuelle Anpassungen erhalten, neue Tage einbeziehen)" in den User-Prompt aufnehmen; bei fehlendem/leerem Feld Prompt exakt wie bisher
    - `SYSTEM_PROMPT_REFLECTION`: knappe Regel ergänzen, dass eine mitgegebene bestehende Reflexion als Ausgangsbasis dient, manuelle Anpassungen erhalten bleiben und neue Tage eingearbeitet werden – ohne Details zu erfinden, unter Beibehaltung der exakten vier Abschnittsüberschriften und des Schweizer Hochdeutsch (kein "ß", immer "ss")
    - _Bug_Condition: isBugConditionB(request) aus design_
    - _Expected_Behavior: Property 3 – Prompt enthält die bestehende Reflexion als Kontextblock_
    - _Preservation: Property 4 – ohne/leere `aktuelleReflexion` bleibt der Prompt identisch_
    - _Requirements: 2.3, 3.3_

  - [x] 4.3 `app/page.tsx` – Override an den Feld-Commit-Punkten verwerfen (Defekt A)
    - `generateDay`: finalen Commit auf `commitWeek(withoutJournalText(working))` umstellen
    - `generateReflection`: finalen Commit auf `commitWeek(withoutJournalText(working))` umstellen
    - `setDayText`: committete Woche durch `withoutJournalText(...)` schleusen (manuelle Tagesbearbeitung verwirft Override)
    - `setReflexion`: committete Woche durch `withoutJournalText(...)` schleusen (manuelle Reflexionsbearbeitung verwirft Override)
    - Override nur am Commit-Punkt verwerfen; Streaming-Darstellung (`working`) unberührt lassen
    - `reviseJournal` und `setJournalText` NICHT ändern (setzen bewusst einen Override → 3.2); `withoutJournalText` ist bereits importiert
    - _Bug_Condition: isBugConditionA(action) aus design – Override gesetzt und danach Feld-Update_
    - _Expected_Behavior: Property 1 – nach Feld-Update gilt displayedJournal(week') == composeJournal(week') inkl. Feld-Update_
    - _Preservation: Property 2 – Anzeige ohne Override und bewusste Gesamtbearbeitung unverändert_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.4_

  - [x] 4.4 `app/page.tsx` – bestehende Reflexion in den Reflexions-Request aufnehmen (Defekt B)
    - In `generateReflection` den aktuellen `week.reflexion` VOR dem Leeren von `working` erfassen
    - Im Request-Body `aktuelleReflexion` nur mitschicken, wenn nach Trim nicht leer
    - Leeren von `working.reflexion` für die Streaming-Darstellung beibehalten; Kontext aus dem zuvor gelesenen Wert bilden
    - _Bug_Condition: isBugConditionB(request) aus design_
    - _Expected_Behavior: Property 3 – Request führt die bestehende Reflexion mit_
    - _Preservation: Property 4 – ohne bestehende Reflexion bleibt der Request unverändert_
    - _Requirements: 2.3, 3.3_

  - [x] 4.5 Bug Condition A Exploration erneut prüfen – jetzt erfüllt
    - **Property 1: Expected Behavior A** – Feld-Update hebt veraltete Anzeige auf
    - **IMPORTANT**: DENSELBEN Check aus Task 1 erneut ausführen – KEINEN neuen Check schreiben
    - Erwartung: nach `generateDay`/`generateReflection`/`setDayText`/`setReflexion` ist `hasManualOverride(week')` false und `displayedJournal(week') == composeJournal(week')` inkl. Feld-Update; im Browser erscheinen neuer Tag bzw. neue Reflexion in Vorschau, Editor, Kopieren und Download
    - **EXPECTED OUTCOME**: Check BESTEHT (Defekt A behoben)
    - _Requirements: 2.1, 2.2_

  - [x] 4.6 Bug Condition B Exploration erneut prüfen – jetzt erfüllt
    - **Property 3: Expected Behavior B** – Reflexions-Prompt nutzt bestehende Reflexion
    - **IMPORTANT**: DENSELBEN Check aus Task 2 erneut ausführen – KEINEN neuen Check schreiben
    - Erwartung: `buildReflectionPrompt` mit nicht-leerer `aktuelleReflexion` enthält den Kontextblock; im Browser baut die neu generierte Reflexion auf der bestehenden auf und bezieht die neuen Tage ein
    - **EXPECTED OUTCOME**: Check BESTEHT (Defekt B behoben)
    - _Requirements: 2.3_

  - [x] 4.7 Preservation-Checks erneut prüfen – keine Regressionen
    - **Property 2: Preservation A** und **Property 4: Preservation B**
    - **IMPORTANT**: DIESELBEN Checks aus Task 3 erneut ausführen – KEINE neuen Checks schreiben
    - Erwartung (¬A): Anzeige ohne Override weiterhin `composeJournal` (3.1); `setJournalText`/`reviseJournal` setzen weiterhin einen übernommenen Override (3.2); Tagesabsatz-Generierung unverändert (3.4)
    - Erwartung (¬B): `buildReflectionPrompt` ohne/leere `aktuelleReflexion` erzeugt denselben Prompt wie bisher (3.3)
    - **EXPECTED OUTCOME**: Alle Preservation-Checks BESTEHEN weiterhin
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Checkpoint – Verifikation und alle Checks bestehen
  - `npm run lint` und `npx tsc --noEmit` ausführen; bei Bedarf `npm run build`
  - Sicherstellen, dass alle Explorations-Checks (Property 1, 3) nach dem Fix bestehen und alle Preservation-Checks (Property 2, 4) weiterhin bestehen
  - Manuelle Browser-Reproduktion der Integrationsabläufe aus `design.md` (Override → Tag/Reflexion → Anzeige aktualisiert; Reflexion mit bestehender als Kontext)
  - Bei Fragen oder unerwartetem Verhalten den Nutzer konsultieren

## Notes

- Tasks 1–3 laufen auf UNGEFIXTEM Code und müssen vor Task 4 abgeschlossen sein. Die Explorations-Checks (1, 2) MÜSSEN fehlschlagen; die Preservation-Checks (3) MÜSSEN bestehen.
- Property-Numerierung folgt `design.md`: Property 1 = Bug Condition A, Property 2 = Preservation A, Property 3 = Bug Condition B, Property 4 = Preservation B.
- Kein verbindliches Test-Framework: reine Funktions-/Prompt-Checks (`displayedJournal`, `buildReflectionPrompt`) können mit dem vorhandenen Vitest umgesetzt werden; UI-State-Übergänge an den Commit-Punkten in `app/page.tsx` werden manuell im Browser geprüft.
- Chirurgischer Scope: nur `types/journal.ts`, `lib/prompt.ts`, `app/page.tsx`. KEINE Änderungen an `app/api/generate/route.ts` oder `lib/journal.ts` (`withoutJournalText` existiert bereits und ist in `page.tsx` importiert).
- Reihenfolge innerhalb des Fixes: 4.1 (Typ) vor 4.2 und 4.4 (nutzen das Feld); 4.3 (Defekt A) ist unabhängig. 4.5–4.7 sind Verifikations-Sub-Tasks nach der Implementierung.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] },
    { "id": 1, "tasks": ["4.1", "4.3"] },
    { "id": 2, "tasks": ["4.2", "4.4"] },
    { "id": 3, "tasks": ["4.5", "4.6", "4.7"] },
    { "id": 4, "tasks": ["5"] }
  ]
}
```
