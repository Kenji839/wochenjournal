# Journal-Update-after-Edit Bugfix Design

## Overview

Dieser Bugfix behebt zwei ineinandergreifende Defekte rund um die manuelle
Überschreibung des Gesamtjournals (`journalText`) und die Neugenerierung der
Reflexion.

**Defekt A – veraltete Journal-Anzeige (1.1, 1.2 → 2.1, 2.2):** Sobald eine
manuelle Überschreibung gesetzt ist, liefert `displayedJournal(week)` den
eingefrorenen `journalText` und ignoriert spätere Änderungen an den
zugrunde liegenden Feldern (`days`, `reflexion`). Ein neu generierter oder
bearbeiteter Tagesabsatz bzw. eine neu generierte Reflexion erscheint nicht
mehr in Vorschau, Editor, Kopieren und Download.

**Defekt B – fehlender Reflexions-Kontext (1.3 → 2.3):** Bei der
Neugenerierung der Reflexion wird die bereits vorhandene (ggf. manuell
angepasste) Reflexion nicht als Kontext mitgeschickt. Manuelle Anpassungen
gehen verloren, und die neue Reflexion baut nicht auf der bisherigen auf.

**Fix-Strategie (chirurgisch):**

- **Defekt A:** Wird ein Tagesabsatz oder die Reflexion (neu) generiert oder
  manuell bearbeitet, wird die manuelle Gesamt-Überschreibung verworfen
  (`withoutJournalText`), sodass die Anzeige wieder aus den Feldern abgeleitet
  wird (`composeJournal`). Die Überschreibung wird ausschliesslich an den
  Commit-Punkten der Felder in `app/page.tsx` entfernt; der bestehende Helfer
  `withoutJournalText` in `lib/journal.ts` wird wiederverwendet.
- **Defekt B:** Die Reflexions-Variante von `GenerateRequest` erhält ein
  optionales Feld für die bestehende Reflexion. Dieses wird in
  `generateReflection` mitgeschickt, in `buildReflectionPrompt` zu einem
  Kontextblock verarbeitet und über `SYSTEM_PROMPT_REFLECTION` als
  Ausgangsbasis (nicht als zu wiederholender Inhalt) genutzt.

Keine neuen Dependencies, keine neuen Module. Änderungen beschränken sich auf
`app/page.tsx`, `types/journal.ts` und `lib/prompt.ts`.

## Glossary

- **Bug_Condition (C)**: Die Bedingung, unter der ein Defekt auftritt – siehe
  die formalen Spezifikationen je Defekt unter "Bug Details".
- **Property (P)**: Das gewünschte Verhalten für Eingaben, die C erfüllen –
  formalisiert in "Correctness Properties".
- **Preservation**: Bestehendes Verhalten ausserhalb der Bug-Bedingung
  (¬C), das durch den Fix unverändert bleiben muss.
- **journalText (Override)**: Optionale manuelle Überschreibung des
  Gesamtjournals auf `WeekJournal`. Ist sie gesetzt, hat sie in der Anzeige
  Vorrang vor dem abgeleiteten Text.
- **displayedJournal(week)**: Funktion in `lib/journal.ts`, die den
  anzuzeigenden Journaltext liefert: den Override, falls vorhanden, sonst den
  aus den Feldern abgeleiteten Text (`composeJournal`).
- **withoutJournalText(week)**: Bestehender Helfer in `lib/journal.ts`, der den
  Override entfernt, sodass der Text wieder aus den Feldern abgeleitet wird.
- **composeJournal(week)**: Setzt aus Header, Tagesabsätzen (Mo–Fr) und
  Reflexion den abgeleiteten Gesamtjournaltext zusammen.
- **generateDay / generateReflection**: Funktionen in `app/page.tsx`, die einen
  Tagesabsatz bzw. die Reflexion per Streaming generieren und am Ende
  committen.
- **setDayText / setReflexion**: Funktionen in `app/page.tsx`, die einen
  manuell bearbeiteten Tagesabsatz bzw. eine manuell bearbeitete Reflexion
  committen.
- **GenerateRequest (mode "reflection")**: Variante des API-Requests für die
  Reflexions-Generierung in `types/journal.ts`.
- **buildReflectionPrompt**: Builder in `lib/prompt.ts`, der System- und
  User-Prompt für die Reflexion zusammenstellt.

## Bug Details

### Bug Condition A – Veraltete Journal-Anzeige

Der Bug tritt auf, sobald eine nicht-leere manuelle Überschreibung gesetzt ist
und danach ein Tagesfeld (`days[i].text`) oder die Reflexion (`reflexion`)
geändert wird – sei es durch Generierung oder manuelle Bearbeitung. Da
`displayedJournal` den eingefrorenen Override zurückgibt und der Override beim
Feld-Update nicht entfernt wird, bleibt die Anzeige stehen und nimmt die neue
Information nicht auf.

**Formal Specification:**
```
FUNCTION isBugConditionA(action)
  INPUT: action = { week, feldUpdate }
         week        : WeekJournal vor dem Update
         feldUpdate  : Änderung an week.days[*].text ODER week.reflexion
  OUTPUT: boolean

  RETURN hasManualOverride(week)              // Override ist gesetzt
         AND feldUpdate aendert days[*].text ODER reflexion
         AND displayedJournal(week_nachUpdate) == week.journalText
             // Anzeige spiegelt das Feld-Update NICHT wider
END FUNCTION
```

### Bug Condition B – Fehlender Reflexions-Kontext

Der Bug tritt auf, wenn die Reflexion neu generiert wird, obwohl bereits eine
nicht-leere Reflexion existiert. Der Request (`GenerateRequest` mode
"reflection") trägt kein Feld für die bestehende Reflexion, daher kann
`buildReflectionPrompt` sie nicht als Kontext übergeben.

**Formal Specification:**
```
FUNCTION isBugConditionB(request)
  INPUT: request of type GenerateRequest (mode = "reflection")
  OUTPUT: boolean

  RETURN request.mode == "reflection"
         AND existierendeReflexion(week).trim() != ""   // Reflexion vorhanden
         AND request enthaelt KEIN Feld fuer die bestehende Reflexion
END FUNCTION
```

### Examples

- **A (Tag nach Override):** Override gesetzt, dann "Montag" neu generiert. Erwartet:
  Vorschau/Editor/Kopieren/Download enthalten den neuen Montag-Absatz. Aktuell:
  unveränderter, eingefrorener Override (alter Montag bzw. ganz ohne ihn).
- **A (Tag manuell bearbeitet):** Override gesetzt, dann "Dienstag" im
  DayCard-Editor bearbeitet. Erwartet: Anzeige übernimmt den geänderten
  Dienstag. Aktuell: Override bleibt, Änderung unsichtbar.
- **A (Reflexion neu generiert):** Override gesetzt, dann Reflexion neu
  generiert. Erwartet: Anzeige zeigt die neue Reflexion. Aktuell: alter
  Override bleibt.
- **B (Reflexion mit Kontext):** Reflexion existiert und wurde manuell
  angepasst, danach "Neu generieren". Erwartet: die neue Reflexion baut auf der
  bestehenden auf und bezieht die neuen Tage ein. Aktuell: die bestehende
  Reflexion wird ignoriert, manuelle Anpassungen gehen verloren.
- **Edge (Erstgenerierung Reflexion):** Keine Reflexion vorhanden, erstmals
  generieren. Erwartet (unverändert): Reflexion aus Tagesabsätzen + Kontext der
  bis zu drei Vorwochen.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Ohne gesetzte Überschreibung wird die Anzeige weiterhin aus den Feldern
  abgeleitet (`composeJournal`) – Header, Tagesabsätze, Reflexion (3.1).
- Eine manuelle Bearbeitung des Gesamtjournals im Editor sowie eine
  KI-Überarbeitung (`reviseJournal`) setzen weiterhin einen anzeigbaren
  `journalText` und werden als Anzeige übernommen (3.2).
- Die Erstgenerierung der Reflexion (noch keine Reflexion vorhanden) nutzt
  weiterhin Tagesabsätze + Kontext der bis zu drei Vorwochen (3.3).
- Die Generierung eines einzelnen Tagesabsatzes setzt weiterhin die Stichworte
  des jeweiligen Tages in einen Absatz um (3.4).
- Streaming-Verhalten, fixes Journalformat, Schweizer Hochdeutsch
  (kein "ß", immer "ss"), das "Manuell bearbeitet"-Badge sowie die Aktion
  "Aus Tagesfeldern neu zusammensetzen" bleiben unverändert.

**Scope:**
Alle Eingaben, die nicht ¬C berühren, bleiben unberührt. Insbesondere:
- Wochen ohne Override (Anzeige war schon immer abgeleitet).
- Manuelle/KI-Bearbeitung des Gesamtjournals selbst (setzt bewusst einen
  Override).
- Reflexions-Erstgenerierung ohne bestehende Reflexion.
- Day-/Reflection-/Revise-API-Routen und deren Validierung im Route Handler.

**Hinweis:** Das tatsächlich erwartete korrekte Verhalten für die
Bug-Bedingungen ist in den Correctness Properties (Property 1 und 3) definiert.
Dieser Abschnitt beschreibt, was sich NICHT ändern darf.

### Designentscheidung: Override beim Feld-Update verwerfen vs. erhalten

Defekt A liesse sich grundsätzlich auf zwei Arten beheben:

1. **Override beim Feld-Update verwerfen** (gewählt): Wird ein Tagesabsatz oder
   die Reflexion generiert/bearbeitet, wird `journalText` entfernt; die Anzeige
   wird wieder aus den Feldern abgeleitet. Das erfüllt 2.1/2.2 direkt und am
   einfachsten und nutzt den bestehenden Helfer `withoutJournalText`.
2. **Override beim Feld-Update intelligent patchen**: den geänderten Tag bzw.
   die Reflexion in den bestehenden Override-Text hineinpatchen. Das erfordert
   das Parsen/Wiederzusammensetzen freien Texts, ist fehleranfällig und steht im
   Widerspruch zu "chirurgische, minimale Änderung".

**Gewählt: Option 1.** Sie steht nicht im Konflikt mit 3.2: Eine manuelle bzw.
KI-Bearbeitung des Gesamtjournals setzt den Override weiterhin bewusst und wird
übernommen. Der Override wird nur dann verworfen, wenn der Nutzer danach gezielt
ein Feld (Tag oder Reflexion) ändert und damit signalisiert, dass die
feldbasierte Ableitung wieder gelten soll. Dieses Verhalten entspricht dem
bereits existierenden "Aus Tagesfeldern neu zusammensetzen" und ist für den
Einzelnutzer das am wenigsten überraschende.

## Hypothesized Root Cause

1. **Override hat in der Anzeige bedingungslos Vorrang (Defekt A):**
   `displayedJournal` gibt `week.journalText` zurück, sobald
   `hasManualOverride(week)` true ist. Die Felder werden in diesem Zustand nicht
   mehr konsultiert.

2. **Feld-Commits lassen den Override stehen (Defekt A):** `generateDay`,
   `generateReflection`, `setDayText` und `setReflexion` in `app/page.tsx`
   aktualisieren `days`/`reflexion`, entfernen aber `journalText` nicht. Ein
   einmal gesetzter Override "friert" die Anzeige ein.

3. **Reflexions-Request kennt die bestehende Reflexion nicht (Defekt B):** Die
   `GenerateRequest`-Variante mode "reflection" in `types/journal.ts` enthält
   nur `days` und `previousWeeks`. `buildReflectionPrompt` und
   `SYSTEM_PROMPT_REFLECTION` haben keinen Zugang zur aktuellen Reflexion, und
   `generateReflection` schickt sie nicht mit.

## Correctness Properties

Property 1: Bug Condition A – Feld-Update hebt veraltete Anzeige auf

_For any_ Woche mit gesetzter manueller Überschreibung, bei der anschliessend
ein Tagesabsatz (`days[i].text`) oder die Reflexion (`reflexion`) generiert oder
manuell bearbeitet wird (isBugConditionA true), SHALL das System die
Überschreibung verwerfen, sodass `displayedJournal` den aus den Feldern
abgeleiteten Text (`composeJournal`) liefert und die neue Information in
Vorschau, Editor, Kopieren und Download sichtbar ist.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation – Anzeige ohne Override und bewusste Gesamtbearbeitung

_For any_ Eingabe, die Bug Condition A nicht erfüllt (kein Override gesetzt,
oder der Nutzer bearbeitet bzw. überarbeitet bewusst das Gesamtjournal), SHALL
das System dasselbe Verhalten wie bisher zeigen: ohne Override Ableitung aus den
Feldern (3.1), bei manueller/KI-Gesamtbearbeitung Übernahme des gesetzten
`journalText` als Anzeige (3.2), und unveränderte Umsetzung der Tagesstichworte
in den Tagesabsatz (3.4).

**Validates: Requirements 3.1, 3.2, 3.4**

Property 3: Bug Condition B – Reflexions-Neugenerierung nutzt bestehende Reflexion

_For any_ Reflexions-Neugenerierung, bei der bereits eine nicht-leere Reflexion
existiert (isBugConditionB true), SHALL das System die bestehende Reflexion als
Kontext mitschicken, sodass der Reflexions-Prompt sie als Ausgangsbasis enthält
und die neue Reflexion die manuellen Anpassungen sowie die neuen Tage einbezieht
statt sie zu ignorieren.

**Validates: Requirements 2.3**

Property 4: Preservation – Reflexions-Erstgenerierung ohne bestehende Reflexion

_For any_ Reflexions-Generierung ohne bestehende Reflexion (Feld fehlt oder
leer, isBugConditionB false), SHALL das System dasselbe Verhalten wie bisher
zeigen: eine Reflexion aus den Tagesabsätzen und dem Kontext der bis zu drei
vorangegangenen Wochen erzeugen, ohne Kontextblock für eine bestehende
Reflexion.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Sofern die Root-Cause-Analyse zutrifft:

**Datei 1**: `app/page.tsx`

Defekt A – Override an den Feld-Commit-Punkten verwerfen. Bestehender Helfer
`withoutJournalText` (bereits importiert) wird auf die committete Woche
angewendet.

1. **`generateDay`**: Beim finalen `commitWeek(working)` den Override entfernen,
   z. B. `commitWeek(withoutJournalText(working))`. Der bestehende, abgeleitete
   Text enthält dann den neuen Tagesabsatz.
2. **`generateReflection`**: Analog beim finalen Commit
   `commitWeek(withoutJournalText(working))`.
3. **`setDayText`**: Beim manuellen Bearbeiten eines Tagesabsatzes den Override
   verwerfen (Defekt 1.1 nennt explizit "generiert oder bearbeitet"), z. B.
   `commitWeek(withoutJournalText({ ...week, days: ... }))`.
4. **`setReflexion`**: Analog beim manuellen Bearbeiten der Reflexion den
   Override verwerfen.

   Hinweis Reihenfolge/Streaming: Während des Streamings wird `working` lokal
   gehalten und nur am Ende committet. Das Verwerfen des Override erfolgt
   ausschliesslich am Commit-Punkt, damit die Streaming-Darstellung unberührt
   bleibt. `reviseJournal` und `setJournalText` bleiben unverändert (setzen
   bewusst einen Override → 3.2).

Defekt B – bestehende Reflexion in den Reflexions-Request aufnehmen.

5. **`generateReflection`**: Den aktuellen `week.reflexion` (vor dem Leeren von
   `working`) erfassen und im Request-Body als optionales Feld (z. B.
   `aktuelleReflexion`) mitschicken, jedoch nur wenn nicht leer. Das Leeren von
   `working.reflexion` für die Streaming-Darstellung bleibt erhalten; der
   Kontext wird aus dem vorher gelesenen Wert gebildet.

**Datei 2**: `types/journal.ts`

6. **`GenerateRequest` (mode "reflection")**: Optionales Feld für die bestehende
   Reflexion ergänzen, z. B. `aktuelleReflexion?: string`. Damit bleibt die
   Erstgenerierung (Feld fehlt) abwärtskompatibel (3.3). `types/journal.ts`
   bleibt einzige Quelle der Wahrheit und wird synchron gehalten.

**Datei 3**: `lib/prompt.ts`

7. **`buildReflectionPrompt`**: Wenn `req.aktuelleReflexion?.trim()` nicht leer
   ist, einen klar abgegrenzten Kontextblock "Bestehende Reflexion (als
   Ausgangsbasis, manuelle Anpassungen erhalten, neue Tage einbeziehen)" in den
   User-Prompt aufnehmen. Bei fehlendem/leerem Feld bleibt der Prompt exakt wie
   bisher.
8. **`SYSTEM_PROMPT_REFLECTION`**: Eine knappe Regel ergänzen, dass – falls eine
   bestehende Reflexion mitgegeben wird – diese als Ausgangsbasis dient,
   manuelle Anpassungen erhalten bleiben und die neuen Tage eingearbeitet
   werden, ohne Details zu erfinden und unter Beibehaltung der exakten vier
   Abschnittsüberschriften und des Schweizer Hochdeutsch (kein "ß", immer "ss").

**Nicht geändert (bewusst):** `app/api/generate/route.ts` braucht keine
Logikänderung – die optionale Eigenschaft fliesst durch `buildReflectionPrompt`;
die bestehende Validierung (mindestens ein Tagesabsatz) bleibt gültig.
`lib/journal.ts` benötigt keine neue Funktion (`withoutJournalText` existiert).

## Testing Strategy

### Validation Approach

Zweiphasig: zuerst die Defekte auf dem ungefixten Code reproduzieren
(Counterexamples sichtbar machen und die Root-Cause-Hypothese bestätigen oder
widerlegen), danach den Fix gegen das erwartete Verhalten prüfen und
sicherstellen, dass bestehendes Verhalten erhalten bleibt.

**Hinweis zur Projektrealität:** Es ist kein verbindliches Test-Framework für
diesen Fix vorgesehen (siehe Steering). Es existieren zwar vereinzelte
`*.test.ts`-Dateien und eine `vitest.config.ts`; die primäre Verifikation
erfolgt jedoch über `npm run lint`, `npx tsc --noEmit`, bei Bedarf
`npm run build` sowie manuelle Reproduktion im Browser. Die folgenden Testfälle
sind entsprechend als manuelle bzw. – wo sinnvoll und mit vorhandenem Vitest
umsetzbar – als reine Funktions-/Prompt-Tests zu verstehen.

### Exploratory Bug Condition Checking

**Goal**: Counterexamples sichtbar machen, BEVOR der Fix implementiert wird, und
die Root-Cause-Analyse bestätigen oder widerlegen. Bei Widerlegung neu
hypothetisieren.

**Test Plan**: Auf dem UNGEFIXTEN Code die Bug-Bedingungen herstellen und das
fehlerhafte Verhalten beobachten – für Defekt A im Browser/State, für Defekt B
über den gebauten Request bzw. den Prompt-Output.

**Test Cases**:
1. **Override + Tag generieren (A)**: Override setzen, "Montag" neu generieren →
   Anzeige bleibt eingefroren (fehlerhaft auf ungefixtem Code).
2. **Override + Tag bearbeiten (A)**: Override setzen, Tagesabsatz im Editor
   ändern → Anzeige bleibt eingefroren (fehlerhaft).
3. **Override + Reflexion generieren (A)**: Override setzen, Reflexion neu
   generieren → Anzeige bleibt eingefroren (fehlerhaft).
4. **Reflexion neu generieren mit bestehender Reflexion (B)**: Der Request
   enthält kein Feld für die bestehende Reflexion; `buildReflectionPrompt`
   übergibt sie nicht (fehlerhaft).

**Expected Counterexamples**:
- `displayedJournal` gibt den alten Override zurück, obwohl `days`/`reflexion`
  aktualisiert wurden.
- Der Reflexions-User-Prompt enthält keinen Kontextblock für die bestehende
  Reflexion.
- Mögliche Ursachen: bedingungsloser Override-Vorrang in `displayedJournal`;
  fehlendes Verwerfen des Override an den Commit-Punkten; fehlendes Feld in
  `GenerateRequest`.

### Fix Checking

**Goal**: Für alle Eingaben, die die Bug-Bedingung erfüllen, liefert der
gefixte Code das erwartete Verhalten.

**Pseudocode:**
```
// Defekt A
FOR ALL action WHERE isBugConditionA(action) DO
  week' := commitNachFix(action)            // generateDay/Reflection/setDayText/setReflexion
  ASSERT NOT hasManualOverride(week')
  ASSERT displayedJournal(week') == composeJournal(week')
  ASSERT displayedJournal(week') enthaelt das Feld-Update
END FOR

// Defekt B
FOR ALL request WHERE isBugConditionB(request) DO
  prompt := buildReflectionPrompt(request_mitAktuellerReflexion)
  ASSERT prompt.user enthaelt die bestehende Reflexion als Kontextblock
END FOR
```

### Preservation Checking

**Goal**: Für alle Eingaben, die die Bug-Bedingung NICHT erfüllen, liefert der
gefixte Code dasselbe Ergebnis wie der Originalcode.

**Pseudocode:**
```
// Anzeige ohne Override / bewusste Gesamtbearbeitung (¬A)
FOR ALL week WHERE NOT isBugConditionA(...) DO
  ASSERT displayedJournal_fixed(week) == displayedJournal_original(week)
END FOR

// Reflexions-Erstgenerierung ohne bestehende Reflexion (¬B)
FOR ALL request WHERE NOT isBugConditionB(request) DO
  ASSERT buildReflectionPrompt_fixed(request) == buildReflectionPrompt_original(request)
END FOR
```

**Testing Approach**: Wo mit dem vorhandenen Vitest sinnvoll, eignen sich
property-/tabellengetriebene Tests für `buildReflectionPrompt` und
`displayedJournal`, da sie viele Eingaben über die Domäne abdecken und
Randfälle erfassen. Für UI-State-Übergänge (Commit-Punkte in `app/page.tsx`)
erfolgt die Prüfung manuell im Browser.

**Test Plan**: Verhalten zuerst auf dem ungefixten Code für ¬C-Eingaben
beobachten, dann prüfen, dass es nach dem Fix unverändert ist.

**Test Cases**:
1. **Anzeige ohne Override (3.1)**: Ohne Override entspricht
   `displayedJournal(week)` weiterhin `composeJournal(week)` – vor und nach Fix
   identisch.
2. **Gesamt-Override erhalten (3.2)**: Manuelle Editor-Bearbeitung
   (`setJournalText`) und KI-Überarbeitung (`reviseJournal`) setzen weiterhin
   einen Override und werden als Anzeige übernommen.
3. **Reflexions-Erstgenerierung (3.3)**: Ohne bestehende Reflexion erzeugt
   `buildReflectionPrompt` denselben Prompt wie bisher (kein Kontextblock).
4. **Tagesabsatz aus Stichworten (3.4)**: Generierung eines Tages setzt die
   Stichworte unverändert in einen Absatz um.

### Unit Tests

- `displayedJournal`: ohne Override → `composeJournal`; mit Override → Override
  (unverändert), und nach `withoutJournalText` → abgeleiteter Text inkl.
  Feld-Update.
- `buildReflectionPrompt`: mit/ohne `aktuelleReflexion`, mit/ohne
  `previousWeeks`; Prüfung auf korrekten Kontextblock und unveränderten
  Erstgenerierungs-Prompt.
- Randfälle: leere/whitespace-only bestehende Reflexion → kein Kontextblock.

### Property-Based Tests

- Über zufällige `WeekJournal`-Zustände: nach einem Feld-Commit mit zuvor
  gesetztem Override gilt `displayedJournal(week') == composeJournal(week')`.
- Über zufällige Reflexions-Requests: `buildReflectionPrompt` enthält die
  bestehende Reflexion genau dann, wenn das Feld nicht leer ist; bei leerem Feld
  ist der Prompt identisch zum bisherigen.

### Integration Tests

- Voller Ablauf (manuell): Override setzen → Tag generieren → Anzeige enthält
  neuen Tag; Override setzen → Reflexion neu generieren → Anzeige enthält neue
  Reflexion, deren Prompt die bestehende Reflexion als Kontext nutzte.
- Kontextwechsel (manuell): Woche wechseln, Erstgenerierung der Reflexion in
  einer Woche ohne bestehende Reflexion bleibt unverändert.
- Verifikation nach den Codeänderungen: `npm run lint` und `npx tsc --noEmit`,
  bei Bedarf `npm run build`.
