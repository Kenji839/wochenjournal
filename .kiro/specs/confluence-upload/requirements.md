# Requirements Document

## Introduction

Dieses Feature erweitert den **Wochenjournal-Generator** um die Möglichkeit, das
fertig zusammengesetzte Wochenjournal direkt nach **Confluence** hochzuladen.
Pro Kalenderwoche (KW) entsteht **eine eigene Confluence-Seite** unterhalb einer
konfigurierten Wurzelseite. Existiert die Seite für eine KW bereits, wird sie
**aktualisiert** statt neu erstellt.

Als fachliches Vorbild dient ein bestehendes Python-Werkzeug ("Confluence
Markdown Sync"), das einen lokalen Ordner als verschachtelte Confluence-Seiten
spiegelt und vorhandene Seiten aktualisiert. Für diese App wird die Confluence-
Anbindung jedoch **in TypeScript neu umgesetzt** (serverseitiger Route Handler
plus `lib`-Modul, das die Confluence-REST-API anspricht) – es wird **nicht** das
Python-Tool aufgerufen.

Die Integration folgt den bestehenden Architektur- und Sicherheitsprinzipien der
App: Confluence-Zugangsdaten (Personal Access Token, Basis-URL, Space-Key,
Wurzelseiten-ID, Benutzername) liegen **ausschliesslich serverseitig** in
`process.env` und werden nie an den Client ausgeliefert oder geloggt. Die App
bleibt ein lokales Einzelnutzer-Werkzeug ohne eigene Datenbank.

## Glossary

- **KW**: Kalenderwoche (1–53)
- **Woche / WeekJournal**: Alle Daten einer Kalenderwoche (5 Tage + Reflexion)
- **Journaltext**: Der von `composeJournal()` erzeugte, fertig formatierte Text
  einer Woche (Header, Tagesabsätze, Reflexion)
- **Confluence_Client**: Serverseitiges `lib`-Modul, das mit der Confluence-
  REST-API kommuniziert (Suchen, Erstellen, Aktualisieren von Seiten)
- **Upload_Endpoint**: Der serverseitige Route Handler `POST /api/confluence`,
  der einen Upload-Auftrag entgegennimmt
- **Storage_Format**: Das von Confluence erwartete XHTML-basierte
  "storage"-Format für Seiteninhalte
- **Storage_Converter**: Die Funktion, die einen Journaltext in das
  Confluence-Storage_Format umwandelt
- **Wurzelseite / Root_Page**: Die per `CONFLUENCE_ROOT_PAGE_ID` konfigurierte
  Confluence-Seite, unter der alle KW-Seiten als Unterseiten angelegt werden
- **Seitentitel / Page_Title**: Der pro KW eindeutige Titel der Confluence-Seite
  im Format `Arbeitsjournal – KW {KW} / {JAHR}`
- **PAT**: Personal Access Token zur Authentifizierung gegenüber Confluence
- **System**: Die Wochenjournal-Generator-Anwendung als Ganzes

## Requirements

### Requirement 1 – Confluence-Verbindung konfigurieren

**User Story:** Als Lernender möchte ich die Confluence-Zugangsdaten über
Umgebungsvariablen hinterlegen, damit die App sich serverseitig und sicher mit
meiner Confluence-Instanz verbinden kann.

#### Acceptance Criteria

1. THE System SHALL die Confluence-Konfiguration ausschliesslich aus den
   serverseitigen Umgebungsvariablen `CONFLUENCE_USERNAME`, `CONFLUENCE_PAT`,
   `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY` und `CONFLUENCE_ROOT_PAGE_ID`
   lesen.
2. THE System SHALL die Confluence-Umgebungsvariablen ohne `NEXT_PUBLIC_`-Präfix
   definieren, sodass sie nicht ins Client-Bundle gelangen.
3. IF beim Upload eine erforderliche Confluence-Umgebungsvariable fehlt oder leer
   ist, THEN THE Upload_Endpoint SHALL mit HTTP-Status 500 und einer generischen
   Fehlermeldung antworten, ohne Variablenwerte preiszugeben.
4. THE System SHALL die Datei `.env.example` um die fünf Confluence-Variablen
   mit erklärenden Kommentaren und ohne echte Werte ergänzen.

### Requirement 2 – Upload des Wochenjournals auslösen

**User Story:** Als Lernender möchte ich das Journal der aktiven Woche per
Knopfdruck nach Confluence hochladen, damit ich es nicht manuell kopieren muss.

#### Acceptance Criteria

1. THE System SHALL in der Gesamtjournal-Vorschau einen Button "Nach Confluence
   hochladen" bereitstellen.
2. WHEN der Nutzer den Button "Nach Confluence hochladen" anklickt, THE System
   SHALL den Journaltext der aktiven Woche zusammen mit deren KW und Jahr an den
   Upload_Endpoint senden.
3. WHILE ein Upload für die aktive Woche läuft, THE System SHALL den Button
   "Nach Confluence hochladen" deaktivieren.
4. IF der Journaltext der aktiven Woche keinen einzigen Tagesabsatz und keine
   Reflexion enthält, THEN THE System SHALL den Upload nicht starten und einen
   Hinweis anzeigen, dass zuerst Inhalte erfasst werden sollen.

### Requirement 3 – Neue KW-Seite unter der Wurzelseite erstellen

**User Story:** Als Lernender möchte ich, dass für eine KW automatisch eine neue
Confluence-Unterseite unter meiner Wurzelseite entsteht, damit meine Journale
strukturiert abgelegt sind.

#### Acceptance Criteria

1. THE Confluence_Client SHALL den Page_Title einer Woche aus KW und Jahr im
   Format `Arbeitsjournal – KW {KW} / {JAHR}` bilden.
2. WHEN ein Upload für eine Woche erfolgt, deren Page_Title im konfigurierten
   Space noch nicht existiert, THE Confluence_Client SHALL im Space
   `CONFLUENCE_SPACE_KEY` eine neue Seite mit diesem Page_Title erstellen.
3. WHEN der Confluence_Client eine neue KW-Seite erstellt, THE Confluence_Client
   SHALL die Seite als direkte Unterseite der Seite mit der ID
   `CONFLUENCE_ROOT_PAGE_ID` anlegen.
4. WHEN der Confluence_Client eine neue KW-Seite erstellt, THE Confluence_Client
   SHALL den Seiteninhalt aus dem in das Storage_Format konvertierten
   Journaltext setzen.

### Requirement 4 – Bestehende KW-Seite aktualisieren

**User Story:** Als Lernender möchte ich, dass ein erneuter Upload derselben KW
die vorhandene Seite aktualisiert statt eine Kopie anzulegen, damit pro KW genau
eine Seite existiert.

#### Acceptance Criteria

1. WHEN ein Upload für eine Woche erfolgt, THE Confluence_Client SHALL im
   konfigurierten Space anhand des Page_Title prüfen, ob bereits eine Seite mit
   diesem Titel existiert.
2. WHEN für den Page_Title bereits eine Seite existiert, THE Confluence_Client
   SHALL deren Inhalt mit dem aktuell in das Storage_Format konvertierten
   Journaltext überschreiben.
3. WHEN der Confluence_Client eine bestehende Seite aktualisiert, THE
   Confluence_Client SHALL die Versionsnummer der Seite gegenüber der zuletzt
   gespeicherten Version um genau 1 erhöhen.
4. WHEN der Confluence_Client eine bestehende Seite aktualisiert, THE
   Confluence_Client SHALL den vorhandenen Page_Title und die vorhandene
   Elternseite der Seite unverändert beibehalten.

### Requirement 5 – Journaltext in das Confluence-Storage-Format konvertieren

**User Story:** Als Lernender möchte ich, dass mein Journal in Confluence sauber
formatiert erscheint, damit es ohne Nacharbeit lesbar ist.

#### Acceptance Criteria

1. THE Storage_Converter SHALL einen Journaltext in gültiges Confluence-
   Storage_Format (XHTML) umwandeln.
2. THE Storage_Converter SHALL die mit `**...**` markierten Überschriften des
   Journaltexts als fett dargestellte Inhalte ins Storage_Format übertragen.
3. THE Storage_Converter SHALL jede Inhaltszeile des Journaltexts im
   Storage_Format als eigene Zeile ausgeben, sodass keine Zeile verloren geht.
4. THE Storage_Converter SHALL die Sonderzeichen `&`, `<` und `>` im
   Journaltext in ihre gültigen XHTML-Entsprechungen maskieren.
5. WHERE eine Zeile des Journaltexts leer ist, THE Storage_Converter SHALL die
   Absatztrennung im Storage_Format erhalten.

### Requirement 6 – Serverseitiger Upload-Endpoint und Sicherheit

**User Story:** Als Lernender möchte ich, dass der Confluence-Upload sicher
serverseitig erfolgt, damit mein PAT geschützt bleibt.

#### Acceptance Criteria

1. THE System SHALL den Upload_Endpoint als `POST /api/confluence` mit
   Node-Runtime und `dynamic = "force-dynamic"` bereitstellen.
2. THE Upload_Endpoint SHALL die Confluence-REST-API nur serverseitig aufrufen
   und PAT, Benutzername und Basis-URL ausschliesslich aus `process.env` lesen.
3. THE Upload_Endpoint SHALL den `CONFLUENCE_PAT` niemals an den Client
   ausliefern und niemals in Logausgaben schreiben.
4. IF der Request-Body nicht die Pflichtangaben Journaltext, KW und Jahr
   enthält, THEN THE Upload_Endpoint SHALL mit HTTP-Status 400 antworten.
5. WHEN ein Upload erfolgreich abgeschlossen ist, THE Upload_Endpoint SHALL mit
   HTTP-Status 200 antworten und kennzeichnen, ob die Seite erstellt oder
   aktualisiert wurde.

### Requirement 7 – Fehlerbehandlung

**User Story:** Als Lernender möchte ich klare Rückmeldung bei Fehlern, damit ich
weiss, ob der Upload geklappt hat und es sonst erneut versuchen kann.

#### Acceptance Criteria

1. IF die Confluence-API einen Fehlerstatus zurückgibt oder nicht erreichbar
   ist, THEN THE Upload_Endpoint SHALL mit einem Fehlerstatus (4xx oder 5xx) und
   einer generischen Fehlermeldung ohne Zugangsdaten antworten.
2. WHEN der Upload fehlschlägt, THE System SHALL eine Fehlermeldung in einem
   roten Banner anzeigen, die zum erneuten Versuch auffordert.
3. WHEN der Upload fehlschlägt, THE System SHALL den Lade-/Upload-Zustand
   zurücksetzen, sodass ein erneuter Versuch möglich ist.
4. WHEN der Upload erfolgreich war, THE System SHALL eine Erfolgsmeldung
   anzeigen, die kennzeichnet, ob die Seite erstellt oder aktualisiert wurde.

### Requirement 8 – Rückmeldung und Status in der UI

**User Story:** Als Lernender möchte ich während und nach dem Upload sehen, was
passiert, damit ich den Fortschritt nachvollziehen kann.

#### Acceptance Criteria

1. WHILE ein Upload läuft, THE System SHALL im Bereich des Upload-Buttons einen
   Lade-/Statushinweis anzeigen.
2. THE System SHALL die gesamte upload-bezogene UI auf Deutsch darstellen.
3. THE System SHALL den Upload-Button im bestehenden Sekundär-Button-Stil
   (weiss, roter Rand) der App darstellen.
