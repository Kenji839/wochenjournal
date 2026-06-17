# Requirements Document

## Introduction

Bei der Generierung eines einzelnen Tagesabsatzes (Modus "day") sollen die
Tagesabsätze der unmittelbar vorangegangenen Kalenderwoche als Kontext
einbezogen werden. Ziel ist ein stimmiger inhaltlicher Übergang zwischen den
Wochen sowie reichhaltigere, anschlussfähige Formulierungen, ohne dass dabei
Details erfunden werden. Der Kontext darf ausschliesslich für Anschluss und
Kontinuität genutzt werden – der erzeugte Absatz bleibt inhaltlich an den
Stichworten des aktuellen Tages verankert.

Die Reflexionsgenerierung bezieht bereits Kontext aus bis zu drei Vorwochen ein.
Diese Funktion überträgt ein analoges, aber auf den Tagesmodus zugeschnittenes
Konzept: genau die eine direkt vorangegangene Woche, auf Ebene der Tagesabsätze.
Fehlt diese Vorwoche oder enthält sie keine Tagesabsätze, verhält sich die
Generierung unverändert wie heute.

Die Änderung respektiert die bestehenden Projektregeln: Prompts ausschliesslich
in `lib/prompt.ts`, `types/journal.ts` als Quelle der Wahrheit, Persistenz nur
über `lib/storage.ts`, keine neuen Abhängigkeiten.

## Glossary

- **Tagesabsatz**: Der generierte oder bearbeitete Fliesstext eines einzelnen
  Arbeitstags (Feld `text` eines `DayEntry`).
- **Stichworte**: Die rohen Eingaben des Nutzers zu einem Arbeitstag (Feld
  `stichworte` eines `DayEntry`).
- **Aktuelle Woche**: Die Kalenderwoche (KW + Jahr), für die gerade ein
  Tagesabsatz generiert wird.
- **Vorwoche**: Die chronologisch unmittelbar vor der aktuellen Woche liegende
  gespeicherte Kalenderwoche.
- **Vorwochen-Kontext**: Die nicht-leeren Tagesabsätze der Vorwoche, die der
  Generierung als geordnete Liste (Wochentag + Tagesabsatz-Text) als Kontext
  mitgegeben werden.
- **Day_Prompt_Builder**: Die Funktion `buildDayPrompt` in `lib/prompt.ts`, die
  System- und User-Prompt für die Tagesgenerierung erzeugt.
- **Storage_Module**: Das Modul `lib/storage.ts`, das gespeicherte Wochen liest
  und Hilfsfunktionen über sie bereitstellt.
- **Generate_API**: Der Route Handler `POST /api/generate`.
- **Page_Controller**: Die Client-Komponente `app/page.tsx`, die den
  Generierungs-Request zusammenstellt und absendet.
- **Tagesgenerierung**: Der Generierungspfad mit `mode: "day"`.

## Requirements

### Requirement 1: Vorwoche ermitteln

**User Story:** Als Lernender möchte ich, dass beim Generieren eines Tages die
direkt vorangegangene Woche herangezogen wird, damit der neue Text inhaltlich an
die letzte Woche anschliesst.

#### Acceptance Criteria

1. WHEN ein Tagesabsatz für die aktuelle Woche generiert wird, THE Storage_Module SHALL aus den gespeicherten Wochen diejenige als Vorwoche bestimmen, die in der chronologischen Reihenfolge (primär nach Jahr, sekundär nach Kalenderwoche, KW 1 bis 53) unmittelbar vor der aktuellen Woche liegt und nicht mit der aktuellen Woche identisch ist.
2. THE Storage_Module SHALL beim Vergleich zweier Wochen das Jahr als primäres und die Kalenderwoche als sekundäres Sortierkriterium verwenden, sodass die höchste gespeicherte Kalenderwoche eines Vorjahres als Vorwoche der ersten Kalenderwoche eines Folgejahres bestimmt wird.
3. WHERE mehrere gespeicherte Wochen chronologisch vor der aktuellen Woche liegen, THE Storage_Module SHALL ausschliesslich genau eine Woche zurückgeben, nämlich die mit der kleinsten chronologischen Differenz zur aktuellen Woche.
4. IF keine gespeicherte Woche chronologisch vor der aktuellen Woche liegt, THEN THE Storage_Module SHALL einen leeren Vorwochen-Kontext zurückgeben, ohne einen Fehler auszulösen.

### Requirement 2: Vorwochen-Tagesabsätze als Kontext bereitstellen

**User Story:** Als Lernender möchte ich, dass die einzelnen Tagesabsätze der
Vorwoche als Kontext bereitstehen, damit konkrete Anknüpfungspunkte für einen
guten Übergang vorhanden sind.

#### Acceptance Criteria

1. WHEN eine Vorwoche bestimmt wurde, THE Storage_Module SHALL deren Tagesabsätze mit nicht-leerem Text in der Reihenfolge von Montag bis Freitag als Vorwochen-Kontext bereitstellen, wobei der Vorwochen-Kontext höchstens fünf Tagesabsätze (je einen pro Wochentag von Montag bis Freitag) enthält.
2. THE Storage_Module SHALL einen Tagesabsatz der Vorwoche als nicht-leer behandeln, wenn dessen Text nach dem Entfernen aller führenden und nachgestellten Leerraumzeichen (einschliesslich Leerzeichen, Tabulatoren und Zeilenumbrüchen) mindestens ein Zeichen enthält, und Tagesabsätze, die diese Bedingung nicht erfüllen, aus dem Vorwochen-Kontext ausschliessen.
3. IF kein Tagesabsatz der Vorwoche die Bedingung für nicht-leeren Text erfüllt, THEN THE Storage_Module SHALL einen leeren Vorwochen-Kontext (eine Liste ohne Einträge) zurückgeben.
4. THE Storage_Module SHALL je bereitgestelltem Tagesabsatz den zugehörigen Wochentag aus dem Bereich Montag bis Freitag mitliefern, sodass jeder Eintrag des Vorwochen-Kontexts eindeutig genau einem Wochentag zugeordnet werden kann.

### Requirement 3: Request-Typ um Vorwochen-Kontext erweitern

**User Story:** Als Entwickler möchte ich den Vorwochen-Kontext typsicher im
Generierungs-Request transportieren, damit Client und Server dasselbe
Datenformat verwenden.

#### Acceptance Criteria

1. THE GenerateRequest SHALL im Modus "day" ein verpflichtendes Feld für den Vorwochen-Kontext führen, das eine in der Reihenfolge Montag bis Freitag geordnete Liste von höchstens fünf Einträgen aufnimmt, wobei jeder Eintrag aus genau einem Wochentag (einer der fünf definierten Werte Montag, Dienstag, Mittwoch, Donnerstag, Freitag) und dem zugehörigen nicht-leeren Tagesabsatz-Text besteht.
2. WHERE im Modus "day" kein Vorwochen-Kontext vorliegt, THE GenerateRequest SHALL das Vorwochen-Kontext-Feld als vorhandene, aber leere Liste führen und es weder weglassen noch als null darstellen.
3. THE GenerateRequest SHALL das bestehende Format der Modi "reflection" und "revise" unverändert beibehalten.

### Requirement 4: Vorwochen-Kontext in den Tages-Prompt einbinden

**User Story:** Als Lernender möchte ich, dass die KI den Vorwochen-Kontext beim
Formulieren berücksichtigt, damit ein nahtloser Übergang und reichhaltigere
Texte entstehen.

#### Acceptance Criteria

1. WHEN der Day_Prompt_Builder einen User-Prompt erzeugt und der Vorwochen-Kontext mindestens einen Tagesabsatz mit nicht-leerem Text enthält, THE Day_Prompt_Builder SHALL die Tagesabsätze der Vorwoche als eigenen, durch Trennlinie und Überschrift markierten und von den Stichworten getrennten Kontextabschnitt in den User-Prompt aufnehmen.
2. WHEN der Day_Prompt_Builder einen User-Prompt erzeugt und der Vorwochen-Kontext keinen Tagesabsatz mit nicht-leerem Text enthält, THE Day_Prompt_Builder SHALL einen User-Prompt erzeugen, der keinen Vorwochen-Kontextabschnitt enthält.
3. THE Day_Prompt_Builder SHALL die Stichworte des aktuellen Tages und den aktuellen Wochentag unverändert im User-Prompt führen.
4. THE Day_Prompt_Builder SHALL im System-Prompt anweisen, den Vorwochen-Kontext ausschliesslich für inhaltlichen Anschluss und Übergang zu nutzen.
5. THE Day_Prompt_Builder SHALL im System-Prompt anweisen, keine Details aus der Vorwoche zu erfinden oder wörtlich zu wiederholen.
6. IF der Vorwochen-Kontext nicht in den User-Prompt aufgenommen werden kann, THEN THE Day_Prompt_Builder SHALL einen gültigen User-Prompt ohne Vorwochen-Kontextabschnitt erzeugen, der die Stichworte des aktuellen Tages und den aktuellen Wochentag weiterhin enthält.

### Requirement 5: Format und Sprache des Tagesabsatzes bleiben unverändert

**User Story:** Als Lernender möchte ich, dass der generierte Tagesabsatz trotz
zusätzlichem Kontext im gewohnten Format und in Schweizer Hochdeutsch bleibt,
damit das Journal direkt abgabefertig ist.

#### Acceptance Criteria

1. THE Day_Prompt_Builder SHALL weiterhin genau einen zusammenhängenden Fliesstext-Absatz ohne Wochentags-Präfix, ohne Aufzählungszeichen und ohne Zeilenumbrüche anfordern.
2. THE Day_Prompt_Builder SHALL weiterhin durchgängiges Schweizer Hochdeutsch anfordern, sodass im erzeugten Tagesabsatz kein "ß" vorkommt und stattdessen durchgängig "ss" verwendet wird.
3. THE Day_Prompt_Builder SHALL weiterhin anweisen, ausschliesslich die Stichworte des aktuellen Tages als inhaltliche Grundlage des Tagesabsatzes zu verwenden.
4. WHERE ein nicht-leerer Vorwochen-Kontext vorliegt, THE Day_Prompt_Builder SHALL anweisen, den Vorwochen-Kontext nur zur Wahrung des Übergangs und zur Vermeidung von Wiederholungen zu nutzen und ihn nicht als Inhalt des aktuellen Tagesabsatzes wiederzugeben.

### Requirement 6: Generierung ohne Vorwoche bleibt stabil

**User Story:** Als Lernender möchte ich, dass die Tagesgenerierung auch in der
ersten Woche oder bei Lücken im Verlauf funktioniert, damit ich jederzeit Tage
generieren kann.

#### Acceptance Criteria

1. IF bei einem Tages-Request kein Vorwochen-Kontext vorliegt, THEN THE Generate_API SHALL den Tagesabsatz erzeugen und dabei dasselbe Ergebnisformat liefern wie bei vorhandenem Vorwochen-Kontext.
2. WHEN der Page_Controller einen Tages-Request ohne verfügbare Vorwoche zusammenstellt, THE Page_Controller SHALL das Feld für den Vorwochen-Kontext als leere Liste (ohne Einträge) mitsenden.
3. WHEN ein Tages-Request mit mindestens einem nicht-leeren Stichwort (nach Entfernen von Leerraum mindestens 1 Zeichen) eintrifft, THE Generate_API SHALL unabhängig vom Vorhandensein eines Vorwochen-Kontexts einen Tagesabsatz erzeugen.
4. IF die Stichworte eines Tages-Requests leer sind (nach Entfernen von Leerraum Länge 0), THEN THE Generate_API SHALL den Request mit Status 400 und einer Fehlermeldung, die die leeren Stichworte benennt, ablehnen und keinen Tagesabsatz erzeugen.
5. IF die Erzeugung des Tagesabsatzes fehlschlägt, THEN THE Generate_API SHALL den Request mit einer Fehlermeldung ablehnen, die den fehlgeschlagenen Generierungsvorgang benennt, und keinen unvollständigen Tagesabsatz als Ergebnis liefern.

### Requirement 7: Vorwochen-Kontext im Client zusammenstellen

**User Story:** Als Lernender möchte ich, dass der Client den passenden
Vorwochen-Kontext automatisch ermittelt, damit ich nichts manuell auswählen muss.

#### Acceptance Criteria

1. WHEN der Page_Controller einen Tages-Request für die aktuelle Woche zusammenstellt, THE Page_Controller SHALL vor dem Absenden des Requests den Vorwochen-Kontext über das Storage_Module aus den gespeicherten Wochen relativ zur aktuellen Woche ermitteln.
2. THE Page_Controller SHALL den ermittelten Vorwochen-Kontext als geordnete Liste aus Wochentag und Tagesabsatz-Text im Tages-Request an die Generate_API übermitteln.
3. WHEN die Generate_API auf einen Tages-Request mit Streaming-Text antwortet, THE Page_Controller SHALL die empfangenen Text-Chunks in Empfangsreihenfolge an den Tagesabsatz des im Request adressierten Wochentags anhängen.
4. IF die Ermittlung des Vorwochen-Kontexts über das Storage_Module fehlschlägt, THEN THE Page_Controller SHALL einen leeren Vorwochen-Kontext im Tages-Request mitsenden und die Tagesgenerierung fortsetzen.
