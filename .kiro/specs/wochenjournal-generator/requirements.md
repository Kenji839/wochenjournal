# Requirements – Wochenjournal-Generator

## Einführung

Der Wochenjournal-Generator ist eine Web-App, die einem Lernenden hilft, sein
wöchentliches Arbeitsjournal **inkrementell über die Woche** zu erstellen.
Zielgruppe ist ein Lernender (Applikationsentwickler EFZ, 3. Lehrjahr,
Appbakery / SBB Zürich).

**Workflow:** Der Nutzer gibt **jeden Tag (Mo–Fr) ein paar Stichworte** ein,
woraus die App per LLM-Anbieter (Google Gemini) einen kurzen, professionellen
Tagesabsatz generiert. **Am Freitag** generiert er aus dem Wocheninhalt die
**Reflexion** (vier Abschnitte). Am Ende wird alles zu einem fertig formatierten
Journal zusammengesetzt, das kopiert oder heruntergeladen werden kann.

Die App nutzt die Google Gemini API (kostenloser Tier) mit Streaming, hat kein
Backend mit Datenbank und kein Login. Der Zustand (laufende Woche + Verlauf) wird
im `localStorage` gehalten. Der API-Key ist ausschliesslich serverseitig
verfügbar.

> **Hinweis zum Stack:** Das ursprüngliche Briefing nennt Next.js 14 und die
> Anthropic Claude API. Im Projekt ist tatsächlich **Next.js 16.2.9 (App Router),
> React 19 und Tailwind v4** installiert; als KI-Anbieter wird **Google Gemini**
> verwendet (mangels Claude-Guthaben). Die Anforderungen werden gegen diese
> Realität umgesetzt.

## Ziel-Journalformat

```
**Arbeitsjournal – KW {KW} / {JAHR}**
Lernender: Timo
Betrieb: Appbakery / SBB, Zürich
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

## Glossar

- **KW**: Kalenderwoche (1–53)
- **Woche / WeekJournal**: Alle Daten einer Kalenderwoche (5 Tage + Reflexion)
- **Tagesabsatz**: Der aus Tages-Stichworten generierte Fliesstext eines Tages
- **Reflexion**: Die vier reflektierenden Abschnitte am Ende des Journals
- **Stichworte**: Kurze, vom Nutzer eingegebene Notizen (pro Tag oder für Reflexion)
- **Verlauf / History**: Liste der gespeicherten Wochen im localStorage

---

## Requirement 1 – Woche auswählen und verwalten

**User Story:** Als Lernender möchte ich eine Kalenderwoche wählen, damit ich
meine Tageseinträge und die Reflexion dieser Woche zuordnen und wiederfinden kann.

### Acceptance Criteria

1. WHEN die Seite zum ersten Mal geladen wird THEN soll das System die aktuelle
   KW und das aktuelle Jahr als aktive Woche vorbelegen.
2. THE System SHALL eine KW-Auswahl von 1 bis 53 und eine Jahreszahl-Eingabe
   bereitstellen.
3. WHEN der Nutzer eine KW/Jahr auswählt, für die bereits Daten existieren THEN
   soll das System die gespeicherte Woche laden.
4. WHEN der Nutzer eine KW/Jahr auswählt, für die noch keine Daten existieren
   THEN soll das System eine neue, leere Woche anlegen.

---

## Requirement 2 – Tägliche Eingabe und Generierung

**User Story:** Als Lernender möchte ich pro Wochentag schnell ein paar
Stichworte eintippen und daraus einen formulierten Tagesabsatz generieren, damit
ich nicht jeden Tag ausformulieren muss.

### Acceptance Criteria

1. THE System SHALL für jeden Wochentag (Montag–Freitag) ein eigenes
   Stichwort-Eingabefeld bereitstellen.
2. THE System SHALL pro Tag einen Button "Tag generieren" bereitstellen.
3. WHILE das Stichwortfeld eines Tages leer ist OR eine Generierung läuft THE
   System SHALL den zugehörigen "Tag generieren"-Button deaktivieren.
4. WHEN der Nutzer "Tag generieren" klickt THEN soll das System aus den
   Tages-Stichworten einen kurzen, professionellen Absatz (2–4 Sätze) streamend
   im Tagesbereich aufbauen.
5. THE System SHALL den generierten Tagesabsatz dem jeweiligen Tag zuordnen und
   sofort persistieren.
6. WHEN ein Tag bereits einen Absatz hat AND der Nutzer erneut "Tag generieren"
   klickt THEN soll das System den Absatz dieses Tages neu erzeugen.

---

## Requirement 3 – Reflexion generieren

**User Story:** Als Lernender möchte ich am Freitag aus den Tagesabsätzen der
Woche die Reflexion generieren – unter Berücksichtigung der letzten Wochen –,
damit ich die vier Abschnitte nicht selbst ausformulieren muss und ableiten kann,
worin ich mich gegenüber den Vorwochen verbessert habe.

### Acceptance Criteria

1. THE System SHALL einen Button "Reflexion generieren" bereitstellen.
2. WHEN der Nutzer "Reflexion generieren" klickt THEN soll das System aus den
   Tagesabsätzen der aktiven Woche die vier Abschnitte "Was ist mir gut
   gelungen?", "Probleme / Herausforderungen", "Was kann ich besser machen?" und
   "Was habe ich neu gelernt?" streamend erzeugen.
3. THE System SHALL der Reflexion den Kontext der bis zu drei direkt
   vorangegangenen gespeicherten Wochen (deren Reflexionen) mitgeben.
4. WHERE Vorwochen mit Reflexion vorhanden sind THE System SHALL erkennbare
   Fortschritte gegenüber den Vorwochen in der Reflexion benennen (insbesondere
   in "Was ist mir gut gelungen?" und "Was kann ich besser machen?").
5. IF noch kein einziger Tagesabsatz vorhanden ist THEN soll das System einen
   Hinweis anzeigen, dass zuerst Tage erfasst werden sollten, und keine
   Generierung starten.
6. THE System SHALL die generierte Reflexion der aktiven Woche zuordnen und
   sofort persistieren.

---

## Requirement 4 – System-Prompts und Format

**User Story:** Als Lernender möchte ich, dass Tagesabsätze und Reflexion exakt
zum vorgegebenen Stil und Format passen, damit ich nichts nacharbeiten muss.

### Acceptance Criteria

1. THE System SHALL einen Tages-System-Prompt verwenden, der aus Stichworten
   einen einzelnen, sachlichen Absatz erzeugt (keine Aufzählung, kein
   Wochentags-Präfix – dieses wird beim Zusammensetzen ergänzt).
2. THE System SHALL einen Reflexions-System-Prompt verwenden, der die vier
   Abschnitte als Aufzählungen mit den korrekten Überschriften erzeugt und – wenn
   Vorwochen-Kontext vorhanden ist – Fortschritte gegenüber den Vorwochen ableitet.
3. THE System SHALL über `buildDayPrompt()` und `buildReflectionPrompt()` die
   Platzhalter und Eingaben einsetzen.
4. THE System SHALL in beiden Prompts festlegen: Schweizer Hochdeutsch (kein "ß",
   immer "ss"), keine erfundenen Details, professioneller aber nicht übertrieben
   formeller Ton, Ausgabe nur des geforderten Inhalts ohne Einleitung.
5. THE System SHALL die fixen Angaben (Lernender: Timo, Betrieb: Appbakery / SBB,
   Zürich, Ausbildungsjahr: 3. Lehrjahr) beim Zusammensetzen des Headers nutzen.

---

## Requirement 5 – Bearbeiten der generierten Texte

**User Story:** Als Lernender möchte ich generierte Tagesabsätze und die
Reflexion nachträglich anpassen, damit ich Details korrigieren kann.

### Acceptance Criteria

1. WHEN ein Tagesabsatz fertig generiert wurde THEN soll er direkt im
   Tagesbereich editierbar sein.
2. WHEN die Reflexion fertig generiert wurde THEN soll sie direkt editierbar sein.
3. WHEN der Nutzer einen Text bearbeitet THEN soll das System die Änderung in der
   aktiven Woche persistieren.

---

## Requirement 6 – Gesamtjournal zusammenstellen und exportieren

**User Story:** Als Lernender möchte ich das vollständige Journal als Text
erhalten und kopieren oder herunterladen, damit ich es abgeben kann.

### Acceptance Criteria

1. THE System SHALL aus Header, allen Tagesabsätzen und der Reflexion ein
   vollständiges Journal im vorgegebenen Format zusammensetzen.
2. THE System SHALL eine Vorschau des zusammengesetzten Gesamtjournals anzeigen.
3. WHEN der Nutzer auf "Kopieren" klickt THEN soll das System das gesamte Journal
   in die Zwischenablage kopieren und den Button-Text für 2 Sekunden zu
   "✓ Kopiert!" wechseln.
4. WHEN der Nutzer auf "Download .txt" klickt THEN soll das System eine Datei mit
   dem Namen `arbeitsjournal-kw{KW}-{JAHR}.txt` herunterladen.
5. IF eine Wochentagszeile keinen Inhalt hat THEN soll das System einen
   neutralen Platzhalter (z. B. "Montag: –") einsetzen, damit das Format
   vollständig bleibt.

---

## Requirement 7 – Persistenz und Verlauf (localStorage)

**User Story:** Als Lernender möchte ich, dass mein Wochenfortschritt erhalten
bleibt und ich frühere Wochen wiederfinde, damit nichts verloren geht.

### Acceptance Criteria

1. THE System SHALL die Wochen unter dem localStorage-Key `wochenjournal_weeks`
   speichern.
2. WHEN ein Tagesabsatz, die Reflexion oder eine Bearbeitung sich ändert THEN
   soll das System die Woche automatisch speichern.
3. THE System SHALL maximal 10 Wochen halten und die am längsten nicht
   aktualisierte verdrängen, wenn eine elfte hinzukommt.
4. THE System SHALL im Verlauf pro Woche "KW {KW} / {JAHR}" als Titel sowie das
   Datum der letzten Aktualisierung anzeigen.
5. WHEN der Nutzer auf einen Verlaufseintrag klickt THEN soll das System diese
   Woche als aktive Woche laden.
6. WHEN der Nutzer auf das Lösch-Icon einer Woche klickt THEN soll das System
   diese Woche aus dem Verlauf entfernen.
7. WHEN die Seite neu geladen wird THEN soll der Verlauf inklusive der zuletzt
   aktiven Woche erhalten bleiben.
8. THE System SHALL pro Woche folgende Struktur speichern: `{ id, kw, jahr,
   days: { weekday, stichworte, text }[], reflexion, updatedAt }`.

---

## Requirement 8 – Generierung mit Streaming (serverseitig) und Sicherheit

**User Story:** Als Lernender möchte ich, dass die Generierung sicher
serverseitig erfolgt, damit mein API-Key geschützt bleibt.

### Acceptance Criteria

1. THE System SHALL einen POST-Endpoint `/api/generate` bereitstellen, der
   sowohl Tages- als auch Reflexions-Anfragen (per `mode`) entgegennimmt.
2. THE System SHALL den Gemini-API-Aufruf nur serverseitig ausführen und den
   API-Key ausschliesslich aus `process.env.GEMINI_API_KEY` lesen.
3. THE System SHALL die Gemini API im Streaming-Modus aufrufen und die
   Text-Deltas fortlaufend als reinen Text-Stream an den Client zurückgeben.
4. WHEN ein Request die nötigen Pflichtangaben nicht enthält THEN soll das System
   mit HTTP 400 antworten.
5. THE System SHALL den API-Key niemals an den Client ausliefern.

---

## Requirement 9 – Fehlerbehandlung

**User Story:** Als Lernender möchte ich klare Rückmeldung bei Fehlern, damit ich
weiss, dass ich es erneut versuchen soll.

### Acceptance Criteria

1. WHEN die API nicht erreichbar ist OR ein Netzwerkfehler auftritt THEN soll das
   System eine Fehlermeldung "Generierung fehlgeschlagen. Bitte versuche es
   erneut." in einem roten Banner anzeigen.
2. WHILE eine Generierung (Tag oder Reflexion) läuft THE System SHALL keinen
   zweiten parallelen Request zulassen.
3. WHEN ein Fehler auftritt THEN soll das System den Lade-/Streaming-Zustand
   sauber zurücksetzen, sodass ein erneuter Versuch möglich ist.

---

## Requirement 10 – UI, Layout und Design

**User Story:** Als Lernender möchte ich eine klare, im SBB-Stil gehaltene
Oberfläche, damit die App professionell wirkt und sich gut bedienen lässt.

### Acceptance Criteria

1. THE System SHALL auf dem Desktop ein zweispaltiges Layout zeigen: links (40%)
   Wochenauswahl und Verlauf, rechts (60%) die Tageseinträge, die Reflexion und
   die Gesamtjournal-Vorschau mit Export-Buttons.
2. THE System SHALL auf Mobile einspaltig in der Reihenfolge Header →
   Wochenauswahl → Tageseinträge → Reflexion → Gesamtjournal/Export → Verlauf
   anzeigen.
3. THE System SHALL einen Header mit Titel "📓 Wochenjournal-Generator" und
   Untertitel "Appbakery / SBB – Lehrjahr 3" anzeigen.
4. THE System SHALL das Farbschema verwenden: Hintergrund #F8F8F8, Panels #FFFFFF
   mit leichtem Schatten, Primärfarbe #EB0000 (Hover #C50000), Text #222222,
   Ränder #E0E0E0, System-Font-Stack.
5. THE System SHALL die Button-Stile umsetzen: Primär (rot, weisser Text) für
   "Tag generieren" und "Reflexion generieren", sekundär (weiss, roter Rand) für
   "Kopieren" und "Download .txt", Ghost für Neugenerierung.
6. WHILE eine Generierung läuft THE System SHALL einen Ladeindikator /
   blinkenden Cursor im betroffenen Bereich anzeigen.
7. THE System SHALL die gesamte UI auf Deutsch darstellen.

---

## Requirement 11 – Nicht-funktionale Anforderungen

**User Story:** Als Lernender möchte ich eine schlanke, fehlerfreie und sichere
App, damit sie zuverlässig läuft.

### Acceptance Criteria

1. WHEN `npm run dev` ausgeführt wird THEN soll die App ohne Fehler oder
   TypeScript-Warnings starten.
2. THE System SHALL TypeScript im Strict-Mode verwenden.
3. THE System SHALL kein Login, keine Auth und keine externe Datenbank verwenden.
4. THE System SHALL keine unnötigen Dependencies einführen.
5. THE System SHALL die `.env.local` mit `ANTHROPIC_API_KEY` ausschliesslich
   serverseitig nutzen und sie nicht versionieren.

---

## Requirement 12 – Kiro Hooks

**User Story:** Als Entwickler möchte ich automatische Prüfungen beim Speichern,
damit Prompt-Struktur und Typen konsistent bleiben.

### Acceptance Criteria

1. THE System SHALL einen Hook "validate-prompt-structure" anlegen, der beim
   Speichern von `lib/prompt.ts` prüft, ob die Prompts alle Pflichtbestandteile
   enthalten (KW/Jahr-Platzhalter, die vier Reflexions-Überschriften, Regeln zu
   Schweizer Hochdeutsch) und sonst warnt.
2. THE System SHALL einen Hook "sync-types-on-api-change" anlegen, der beim
   Speichern von `lib/claude.ts` oder `app/api/generate/route.ts` prüft, ob die
   Typen in `types/journal.ts` noch zur Request-/Response-Struktur passen, und
   sonst einen Hinweis ausgibt.
