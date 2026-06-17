# Requirements Document

## Introduction

Diese Erweiterung des bestehenden **Wochenjournal-Generators** adressiert drei
Wünsche des Nutzers:

1. **Modernes Übersichts-Layout** – Die bisherige, vertikal gestapelte
   Karten-Oberfläche zeigt nicht alles auf einen Blick und wirkt unpraktisch.
   Gewünscht ist ein Layout, das die Woche (Tageseinträge, Reflexion und das
   fertige Gesamtjournal) kompakt und gleichzeitig sichtbar macht.
2. **Manuelles Bearbeiten des fertigen Gesamtjournals** – Am Ende soll der Nutzer
   den **zusammengesetzten Gesamttext** als Freitext direkt von Hand anpassen
   können (nicht nur die einzelnen Tages-/Reflexionsfelder).
3. **KI-Überarbeitung des gesamten Journals** – Ein Eingabefeld, in das der Nutzer
   eine natürlichsprachliche Anweisung schreibt (z. B. „formeller formulieren",
   „den Dienstag-Absatz kürzen"), woraufhin Google Gemini das **gesamte fertige
   Journal** als Ganzes überarbeitet und streamend zurückgibt.

Die Erweiterung baut auf der bestehenden Architektur auf: Next.js 16 (App Router),
React 19, Tailwind v4, Google Gemini (`@google/genai`) mit serverseitigem
`text/plain`-Streaming, Persistenz über `localStorage` (`lib/storage.ts`), Prompts
ausschliesslich in `lib/prompt.ts`, API-Key nur serverseitig. Es werden keine
neuen Dependencies eingeführt; die UI bleibt auf Deutsch und generierte Inhalte
in Schweizer Hochdeutsch (kein „ß", immer „ss").

> **Verhältnis zur Bestands-Spec:** Die bestehenden Fähigkeiten (Wochenauswahl,
> Tagesgenerierung, Reflexionsgenerierung, Verlauf, Kopieren/Download) bleiben
> erhalten. Diese Spec ergänzt das Layout sowie zwei neue Bearbeitungswege für das
> **Gesamtjournal** und hält das feste Journalformat bei.

## Ziel-Journalformat (unverändert, muss erhalten bleiben)

```
**Arbeitsjournal – KW {KW} / {JAHR}**
Lernender: Timo
Betrieb: Appbakery / SBB, Bern
Ausbildungsjahr: 3. Lehrjahr

**Was habe ich diese Woche gemacht?**
Montag: …
Dienstag: …
Mittwoch: …
Donnerstag: …
Freitag: …

**Was ist mir in dieser Woche gut gelungen?**
- …
**Probleme / Herausforderungen**
- …
**Was kann ich besser machen in Zukunft?**
- …
**Was habe ich diese Woche neu gelernt?**
- …
```

## Glossary

- **Gesamtjournal**: Der vollständige, zusammengesetzte Journaltext einer Woche
  (Header + Tagesabsätze + Reflexion), wie ihn `composeJournal()` erzeugt.
- **Abgeleiteter Text**: Das Gesamtjournal, solange es ausschliesslich aus den
  strukturierten Feldern (Tagesabsätze, Reflexion) zusammengesetzt wird.
- **Manuelle Überschreibung (journalText)**: Ein gespeicherter Gesamtjournal-Text,
  den der Nutzer von Hand bearbeitet oder per KI überarbeitet hat und der den
  abgeleiteten Text für Vorschau und Export ersetzt.
- **Anweisung**: Die natürlichsprachliche Eingabe des Nutzers zur Überarbeitung
  des gesamten Journals (z. B. „formeller", „Dienstag kürzen").
- **Journal_Editor**: Die Funktion zum manuellen Freitext-Bearbeiten des
  Gesamtjournals.
- **Journal_Reviser**: Die Funktion, die das gesamte Journal per Gemini gemäss
  der Anweisung überarbeitet.
- **Generate_API**: Der serverseitige Route Handler `POST /api/generate`.
- **Storage**: Die localStorage-Persistenz über `lib/storage.ts`.
- **WeekJournal**: Datenobjekt einer Kalenderwoche (siehe `types/journal.ts`).

---

## Requirements

### Requirement 1: Modernes Übersichts-Layout

**User Story:** Als Lernender möchte ich ein kompaktes Layout, in dem ich
Tageseinträge, Reflexion und das fertige Gesamtjournal gleichzeitig sehe, damit
ich die ganze Woche auf einen Blick erfassen und schneller arbeiten kann.

#### Acceptance Criteria

1. THE Übersichts_Layout SHALL die fünf Tageseinträge (Montag–Freitag) in einer
   Raster-Anordnung darstellen, sodass auf einem Desktop-Viewport ab 1024px
   Breite alle fünf Tage ohne Scrollen innerhalb ihres Bereichs sichtbar sind.
2. THE Übersichts_Layout SHALL die Tageseinträge, die Reflexion und die
   Gesamtjournal-Vorschau gemeinsam auf einer Seite anzeigen.
3. WHILE der Viewport mindestens 1024px breit ist, THE Übersichts_Layout SHALL
   alle fünf Tagesbereiche gleichzeitig sichtbar darstellen, ohne horizontales
   Scrollen und ohne Seitenwechsel.
4. WHILE der Viewport schmaler als 1024px ist, THE Übersichts_Layout SHALL die
   Inhalte einspaltig in der Reihenfolge Wochenauswahl, Tageseinträge, Reflexion,
   Gesamtjournal, Verlauf anordnen.
5. WHEN sich ein Tageseintrag oder die Reflexion ändert, THE Übersichts_Layout
   SHALL die Gesamtjournal-Vorschau innerhalb von 1 Sekunde aktualisieren.
6. IF ein Tag noch keinen generierten Absatz besitzt, THEN THE Übersichts_Layout
   SHALL dessen Bereich im Raster belassen und als leer kennzeichnen, ohne ihn
   auszublenden.
7. THE Übersichts_Layout SHALL das bestehende Farbschema beibehalten
   (Hintergrund #F8F8F8, Panels #FFFFFF, Primärfarbe #EB0000, Hover #C50000,
   Text #222222, Ränder #E0E0E0).
8. THE Übersichts_Layout SHALL die statischen Beschriftungen, Buttons und
   Hinweistexte der Oberfläche auf Deutsch darstellen.
9. THE Übersichts_Layout SHALL jede der Funktionen Wochenauswahl,
   Tagesgenerierung, Reflexionsgenerierung, Verlauf, Kopieren und Download über
   ein sichtbares, bedienbares Bedienelement ohne Seitenwechsel auslösbar machen.

---

### Requirement 2: Manuelles Bearbeiten des Gesamtjournals

**User Story:** Als Lernender möchte ich das fertig zusammengesetzte Gesamtjournal
am Ende als Freitext direkt bearbeiten, damit ich letzte Korrekturen am Gesamttext
vornehmen kann, ohne einzelne Tagesfelder anzupassen.

#### Acceptance Criteria

1. THE Journal_Editor SHALL das Gesamtjournal in einem bearbeitbaren
   Freitextfeld mit einer Maximallänge von 20'000 Zeichen bereitstellen.
2. WHEN der Journal_Editor geöffnet wird AND keine manuelle Überschreibung
   vorhanden ist, THE Journal_Editor SHALL das Feld mit dem aus den
   strukturierten Feldern abgeleiteten Gesamtjournal-Text vorbelegen.
3. WHEN der Nutzer den Gesamtjournal-Text im Freitextfeld ändert und der Text
   mindestens ein Nicht-Leerzeichen enthält, THE Storage SHALL die Änderung
   innerhalb von 2 Sekunden als manuelle Überschreibung (`journalText`) der
   aktiven Woche speichern.
4. WHILE eine manuelle Überschreibung vorhanden ist, THE System SHALL den
   überschriebenen Text als Quelle für Vorschau, Kopieren und Download verwenden.
5. THE Journal_Editor SHALL eine Aktion „Aus Tagesfeldern neu zusammensetzen"
   bereitstellen.
6. WHEN der Nutzer die Aktion „Aus Tagesfeldern neu zusammensetzen" auslöst,
   THE System SHALL vor dem Verwerfen der manuellen Überschreibung eine
   Bestätigung verlangen.
7. WHILE eine manuelle Überschreibung vorhanden ist, THE Übersichts_Layout SHALL
   sichtbar kennzeichnen, dass das Gesamtjournal manuell bearbeitet wurde.
8. WHEN der Nutzer die Aktion „Aus Tagesfeldern neu zusammensetzen" bestätigt,
   THE System SHALL die manuelle Überschreibung verwerfen und den
   Gesamtjournal-Text wieder aus den strukturierten Feldern ableiten.
9. WHEN der Nutzer die Aktion „Aus Tagesfeldern neu zusammensetzen" abbricht,
   THE System SHALL die manuelle Überschreibung unverändert beibehalten.
10. WHEN der Nutzer das Freitextfeld leert, sodass es nach Entfernen der
    Leerzeichen keinen Inhalt mehr enthält, THE System SHALL die manuelle
    Überschreibung entfernen und den abgeleiteten Text wiederherstellen.

---

### Requirement 3: KI-Überarbeitung des gesamten Journals

**User Story:** Als Lernender möchte ich dem System eine Anweisung geben (z. B.
„formeller", „Dienstag kürzen"), damit Gemini das gesamte fertige Journal als
Ganzes überarbeitet und ich nicht jeden Abschnitt einzeln anpassen muss.

#### Acceptance Criteria

1. THE Journal_Reviser SHALL ein einzeiliges Texteingabefeld für eine Anweisung
   sowie einen Auslöse-Button bereitstellen.
2. WHILE das Anweisungsfeld leer ist OR eine Generierung läuft, THE Journal_Reviser
   SHALL den Auslöse-Button deaktivieren.
3. WHEN der Nutzer eine nicht-leere Anweisung absendet, THE Journal_Reviser SHALL
   das aktuelle Gesamtjournal und die Anweisung an die Generate_API senden und das
   überarbeitete Gesamtjournal streamend im Gesamtjournal-Bereich aufbauen.
4. WHEN die Überarbeitung abgeschlossen ist, THE Storage SHALL den überarbeiteten
   Text als manuelle Überschreibung (`journalText`) der aktiven Woche speichern.
5. THE Journal_Reviser SHALL in der Überarbeitung das feste Journalformat
   beibehalten (Header, Abschnitt „Was habe ich diese Woche gemacht?" mit den
   Tageszeilen Montag–Freitag, die vier Reflexions-Überschriften in dieser
   Reihenfolge).
6. THE Journal_Reviser SHALL die Überarbeitung in Schweizer Hochdeutsch ausgeben
   (kein „ß", immer „ss").
7. THE Journal_Reviser SHALL ausschliesslich Inhalte aus dem übergebenen
   Gesamtjournal verwenden und keine zusätzlichen Details erfinden.
8. IF das aktuelle Gesamtjournal keinen Inhalt ausser dem Header und leeren
   Platzhaltern enthält, THEN THE Journal_Reviser SHALL einen Hinweis anzeigen,
   dass zuerst Inhalte erfasst werden sollten, und keine Überarbeitung starten.

---

### Requirement 4: Überarbeitungs-Prompt in lib/prompt.ts

**User Story:** Als Entwickler möchte ich, dass der Überarbeitungs-Prompt zentral und konsistent zu den bestehenden Prompts liegt, damit Stil- und Formatregeln an einer Stelle gepflegt werden.

#### Acceptance Criteria

1. THE System SHALL den Überarbeitungs-Prompt (System-Prompt-Konstante) und dessen Builder ausschliesslich in `lib/prompt.ts` definieren; ausserhalb von `lib/prompt.ts` SHALL kein weiterer Überarbeitungs-Prompt-Text oder -Builder definiert sein.
2. WHEN `buildRevisePrompt()` mit dem Gesamtjournal als Text und der Anweisung als Text aufgerufen wird, THE System SHALL ein Objekt mit getrenntem System-Prompt und User-Prompt zurückgeben, in derselben Struktur wie die bestehenden Builder `buildDayPrompt()` und `buildReflectionPrompt()`.
3. WHEN `buildRevisePrompt()` aufgerufen wird, THE System SHALL im User-Prompt das vollständige übergebene Gesamtjournal sowie die vollständige Anweisung einsetzen, jeweils nur um führende und abschliessende Leerzeichen bereinigt und inhaltlich unverändert.
4. THE Überarbeitungs-Prompt SHALL dieselben gemeinsamen Stil- und Inhaltsregeln festlegen wie die bestehenden System-Prompts: das feste Journalformat beibehalten, Schweizer Hochdeutsch (kein „ß", immer „ss"), keine erfundenen Details, und als Ausgabe ausschliesslich den überarbeiteten Journaltext ohne Einleitung oder Kommentar.
5. THE Überarbeitungs-Prompt SHALL anweisen, die Anweisung des Nutzers auf das gesamte Journal anzuwenden und alle von der Anweisung nicht betroffenen Teile unverändert beizubehalten.

---

### Requirement 5: Generate-API um Überarbeitungs-Modus erweitern

**User Story:** Als Lernender möchte ich, dass die Überarbeitung sicher
serverseitig über den bestehenden Streaming-Endpoint läuft, damit mein API-Key
geschützt bleibt und das Streaming-Verhalten konsistent ist.

#### Acceptance Criteria

1. THE Generate_API SHALL einen zusätzlichen Modus `mode: "revise"` annehmen, der das Gesamtjournal als String-Feld `journalText` und die Anweisung als String-Feld `anweisung` entgegennimmt.
2. THE System SHALL den Typ `GenerateRequest` in `types/journal.ts` um die `revise`-Variante mit den String-Feldern `journalText` und `anweisung` erweitern und synchron zur Generate_API halten.
3. IF ein `revise`-Request einen nach Entfernen der Leerzeichen leeren `journalText` OR eine nach Entfernen der Leerzeichen leere `anweisung` enthält, THEN THE Generate_API SHALL ohne Gemini-Aufruf mit HTTP 400 antworten und in der Antwort das fehlende Feld benennen.
4. THE Generate_API SHALL den Gemini-Aufruf nur serverseitig ausführen und den API-Key ausschliesslich aus `process.env.GEMINI_API_KEY` lesen.
5. WHEN ein gültiger `revise`-Request verarbeitet wird, THE Generate_API SHALL die Überarbeitung als reinen Stream mit Content-Type `text/plain; charset=utf-8` und ohne SSE-Formatierung an den Client zurückgeben.
6. THE Generate_API SHALL den API-Key weder im Response-Body noch in Response-Headern an den Client ausliefern noch in Logs ausgeben.
7. IF ein Request ungültiges JSON OR einen unbekannten `mode` enthält, THEN THE Generate_API SHALL mit HTTP 400 antworten.
8. IF das Gemini-Kontingent erschöpft ist, THEN THE Generate_API SHALL mit HTTP 429 antworten.
9. IF der Gemini-Aufruf aus einem anderen Grund fehlschlägt, THEN THE Generate_API SHALL mit HTTP 500 antworten, ohne interne Fehlerdetails preiszugeben.

---

### Requirement 6: Persistenz der Bearbeitung

**User Story:** Als Lernender möchte ich, dass meine manuelle Bearbeitung und die
KI-Überarbeitung des Gesamtjournals erhalten bleiben, damit nichts verloren geht.

#### Acceptance Criteria

1. THE System SHALL das Datenmodell `WeekJournal` um ein optionales Feld `journalText` (String mit 0 bis 50'000 Zeichen) für die manuelle Überschreibung erweitern.
2. WHEN eine Woche mit manueller Überschreibung gespeichert wird, THE Storage SHALL den `journalText` zusammen mit den übrigen Wochendaten unter dem bestehenden `localStorage`-Key `wochenjournal_weeks` so persistieren, dass ein anschliessendes Laden derselben Woche denselben `journalText` zurückgibt wie zuletzt geschrieben.
3. IF das Schreiben in `localStorage` fehlschlägt (nicht verfügbar oder Speicherkontingent überschritten), THEN THE Storage SHALL den zuvor gespeicherten Zustand unverändert belassen und den Fehlschlag an den Aufrufer signalisieren.
4. WHEN die Seite neu geladen wird AND die aktive Woche einen nicht-leeren `journalText` besitzt, THE System SHALL diesen `journalText` unverändert sowohl in der Gesamtjournal-Vorschau als auch im Bearbeitungsfeld anzeigen.
5. WHEN der Nutzer die manuelle Überschreibung verwirft, THE Storage SHALL das Feld `journalText` der aktiven Woche entfernen, sodass ein anschliessendes Laden derselben Woche keinen `journalText` mehr enthält.
6. WHEN eine Woche ohne `journalText` (Bestandsdaten) geladen wird, THE Storage SHALL die Woche ohne Fehler laden und sie wie eine Woche ohne manuelle Überschreibung behandeln.

---

### Requirement 7: Export und Kopieren bei vorhandener Bearbeitung

**User Story:** Als Lernender möchte ich, dass Kopieren und Download immer den aktuell sichtbaren Gesamttext liefern, damit das Abgabedokument meinen Bearbeitungen entspricht.

#### Acceptance Criteria

1. WHEN der Nutzer „Kopieren" auslöst, THE System SHALL den aktuell angezeigten Gesamtjournal-Text (manuelle Überschreibung, falls vorhanden, sonst den abgeleiteten Text) unverändert und vollständig in die Zwischenablage kopieren.
2. WHEN der Nutzer „Download .txt" auslöst, THE System SHALL eine Datei mit dem Namen `arbeitsjournal-kw{KW}-{JAHR}.txt` herunterladen, wobei `{KW}` zweistellig mit führender Null (01 bis 53) und `{JAHR}` vierstellig formatiert ist und der Inhalt dem aktuell angezeigten Gesamtjournal-Text entspricht.
3. WHEN der Nutzer „Kopieren" auslöst und der Kopiervorgang erfolgreich abgeschlossen ist, THE System SHALL den Button-Text für 2 Sekunden zu „✓ Kopiert!" wechseln und ihn danach wieder auf „Kopieren" zurücksetzen.
4. IF beim Auslösen von „Kopieren" oder „Download .txt" der aktuell angezeigte Gesamtjournal-Text leer ist (kein abgeleiteter Text und keine Überschreibung vorhanden), THEN THE System SHALL die Aktion nicht ausführen und die jeweilige Schaltfläche im deaktivierten Zustand darstellen.
5. IF der Kopiervorgang fehlschlägt (Zwischenablage nicht verfügbar oder Zugriff verweigert), THEN THE System SHALL eine Fehlermeldung anzeigen, die auf den fehlgeschlagenen Kopiervorgang hinweist, den Button-Text unverändert auf „Kopieren" belassen und den angezeigten Gesamtjournal-Text erhalten.

---

### Requirement 8: Fehlerbehandlung bei der Überarbeitung

**User Story:** Als Lernender möchte ich klare Rückmeldung, wenn die Überarbeitung
fehlschlägt, damit ich weiss, dass ich es erneut versuchen kann.

#### Acceptance Criteria

1. IF die Generate_API innerhalb von 30 Sekunden keine Verbindung herstellt OR ein Netzwerkfehler auftritt, THEN THE System SHALL innerhalb von 1 Sekunde die Meldung „Generierung fehlgeschlagen. Bitte versuche es erneut." in einem roten Banner anzeigen.
2. WHILE eine Überarbeitung läuft, THE System SHALL jeden weiteren Generierungs-Request (Tag, Reflexion oder Überarbeitung) ablehnen und keinen parallelen Request starten.
3. IF der Laufzustand nicht eindeutig als „nicht laufend" erkannt wird, THEN THE System SHALL einen neuen Überarbeitungs-Request blockieren statt ihn zu starten.
4. IF während der Überarbeitung ein Fehler auftritt, THEN THE System SHALL den Streaming-Zustand auf „nicht laufend" zurücksetzen und den bereits empfangenen Teiltext im Zielfeld unverändert erhalten.
5. IF das Gemini-Kontingent erschöpft ist, THEN THE System SHALL die vom Server gelieferte Meldung zum erschöpften Kontingent im selben roten Banner anzeigen.
6. WHEN nach einem Fehler der Streaming-Zustand auf „nicht laufend" zurückgesetzt ist, THE System SHALL den Auslöser für die Überarbeitung erneut aktivieren, sodass ein neuer Versuch ohne Neuladen der Seite möglich ist.

---

### Requirement 9: Nicht-funktionale Anforderungen

**User Story:** Als Lernender möchte ich, dass die Erweiterung schlank, sicher und fehlerfrei bleibt, damit die App zuverlässig läuft.

#### Acceptance Criteria

1. THE System SHALL keine neuen Laufzeit-Dependencies ausser dem bereits genutzten `@google/genai` einführen; die Liste der Laufzeit-Dependencies in `package.json` SHALL ausschliesslich `@google/genai` als KI-/Fremd-SDK enthalten.
2. THE System SHALL TypeScript im Strict-Mode verwenden und SHALL bei `npx tsc --noEmit` mit Exit-Code 0 und null Typfehlern abschliessen.
3. WHEN `npm run lint` ausgeführt wird, THE System SHALL mit Exit-Code 0, null Errors und null Warnings durchlaufen.
4. WHEN `npx tsc --noEmit` ausgeführt wird, THE System SHALL mit Exit-Code 0 und null Fehlern durchlaufen.
5. THE System SHALL die Prompts und Prompt-Builder ausschliesslich in `lib/prompt.ts` definieren.
6. THE System SHALL jeden `localStorage`-Zugriff (Lesen, Schreiben, Löschen) ausschliesslich über `lib/storage.ts` ausführen.
7. THE System SHALL den Gemini-Aufruf und den Zugriff auf `process.env.GEMINI_API_KEY` ausschliesslich in serverseitigem Code (Route Handler, `lib/ai.ts`) ausführen; der API-Schlüssel SHALL weder im Client-Bundle enthalten noch in Logs ausgegeben werden.
