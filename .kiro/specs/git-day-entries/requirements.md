# Requirements Document

## Introduction

Dieses Feature erweitert den Wochenjournal-Generator um eine neue API-Route, die
Git-Commit-Daten aus einem lokalen Repository ausliest und sie als vorausgefüllte
Stichworte je Wochentag (Montag–Freitag) zurückliefert. Im Frontend erhält die
bestehende Tages-Komponente einen zusätzlichen Button, mit dem die Commit-Titel
einer Kalenderwoche in das jeweilige Stichwort-Feld übernommen werden, ohne
bestehende Inhalte zu überschreiben.

Das Feature ist für den rein lokalen Betrieb gedacht. Da ein vom Client
gelieferter Repository-Pfad an einen Git-Aufruf weitergereicht wird, adressieren
die Requirements ausdrücklich das Risiko einer Command-Injection sowie eines
Path-Traversal-Zugriffs auf beliebige Verzeichnisse.

## Glossary

- **Git_Summary_API**: Der serverseitige Route Handler `GET /api/git-summary`,
  der Git-Commit-Daten ausliest und als JSON zurückgibt.
- **Git_Reader**: Die serverseitige Logik (in `lib/`), die einen Git-Befehl
  gegen ein lokales Repository ausführt und dessen Ausgabe in strukturierte
  Daten überführt.
- **Repository_Pfad**: Der absolute oder relative Dateisystempfad zum lokalen
  Git-Repository, aus dem Commits gelesen werden.
- **GIT_REPO_PATH**: Die optionale Umgebungsvariable in `.env.local`, die den
  Standard-Repository_Pfad definiert.
- **Default_Repository_Pfad**: Der Fallback-Pfad `../inclusive-app-backend`
  (relativ zum Arbeitsverzeichnis des Servers), der verwendet wird, wenn weder
  Query-Parameter noch GIT_REPO_PATH einen Pfad liefern.
- **Tagesgruppierung**: Die Zuordnung von Commit-Titeln zu den Wochentagen
  Montag bis Freitag der angefragten Kalenderwoche.
- **Commit_Titel**: Die erste Zeile (Subject) einer Git-Commit-Message.
- **Merge_Commit**: Ein Commit, dessen Commit_Titel mit `Merge ` beginnt
  (z. B. `Merge branch ...`, `Merge pull request ...`).
- **Konfigurierter_Author**: Der über `git config user.name` im Ziel-Repository
  ermittelte Author-Name, dessen Commits ausschliesslich berücksichtigt werden.
- **Git_Load_Button**: Das Bedienelement "Aus Git laden" in der Tages-Komponente
  (`DayCard`), das das Laden der Git-Stichworte für einen Wochentag auslöst.
- **Stichwort_Feld**: Das Textarea-Feld eines Wochentags, in das Stichworte
  eingetragen werden.
- **Kalenderwoche**: Die ISO-8601-Kalenderwoche (Montag als erster Tag), wie von
  `lib/date.ts` verwendet.
- **Leere_Antwort**: Eine erfolgreiche JSON-Antwort, bei der alle fünf
  Wochentage eine leere Liste enthalten.

## Requirements

### Requirement 1: Git-Zusammenfassung über API abrufen

**User Story:** Als Nutzer des Wochenjournal-Generators möchte ich die Commits
einer Kalenderwoche pro Wochentag abrufen, damit ich meine Tagesstichworte nicht
manuell aus der Git-Historie zusammensuchen muss.

#### Acceptance Criteria

1. WHEN eine GET-Anfrage an `/api/git-summary` mit gültigen Parametern eingeht, THE Git_Summary_API SHALL ein JSON-Objekt mit den Feldern `week`, `year` und `days` zurückgeben.
2. THE Git_Summary_API SHALL im Feld `days` genau die fünf Schlüssel `monday`, `tuesday`, `wednesday`, `thursday` und `friday` enthalten.
3. THE Git_Summary_API SHALL jedem der fünf Wochentags-Schlüssel eine Liste von Zeichenketten (Commit_Titel) zuordnen.
4. THE Git_Summary_API SHALL den HTTP-Statuscode 200 zurückgeben, WHEN die Anfrage erfolgreich verarbeitet wurde.
5. THE Git_Summary_API SHALL als Server-seitiger Route Handler mit Node.js-Runtime betrieben werden und nicht gecacht werden.

### Requirement 2: Query-Parameter verarbeiten

**User Story:** Als Nutzer möchte ich Repository-Pfad, Kalenderwoche und Jahr als
Parameter übergeben, damit ich gezielt die Commits einer bestimmten Woche und
eines bestimmten Repositories abrufen kann.

#### Acceptance Criteria

1. THE Git_Summary_API SHALL die Query-Parameter `repoPath`, `week` und `year` aus der Anfrage auslesen.
2. THE Git_Summary_API SHALL die Parameter `week` und `year` validieren, bevor der Git_Reader aufgerufen wird oder weitere Verarbeitung stattfindet.
2. WHERE der Query-Parameter `repoPath` fehlt oder leer ist, THE Git_Summary_API SHALL den Wert der Umgebungsvariable GIT_REPO_PATH als Repository_Pfad verwenden.
3. WHERE weder der Query-Parameter `repoPath` noch GIT_REPO_PATH einen Wert liefern, THE Git_Summary_API SHALL den Default_Repository_Pfad `../inclusive-app-backend` als Repository_Pfad verwenden.
4. IF der Query-Parameter `week` fehlt, keine ganze Zahl ist oder ausserhalb des Bereichs 1 bis 53 liegt, THEN THE Git_Summary_API SHALL den HTTP-Statuscode 400 mit einer beschreibenden Fehlermeldung zurückgeben.
5. IF der Query-Parameter `year` fehlt, keine ganze Zahl ist oder ausserhalb des Bereichs 2000 bis 2100 liegt, THEN THE Git_Summary_API SHALL den HTTP-Statuscode 400 mit einer beschreibenden Fehlermeldung zurückgeben.
6. WHEN gültige Werte für `week` und `year` empfangen werden, THE Git_Summary_API SHALL diese Werte unverändert in den Feldern `week` und `year` der Antwort zurückgeben.

### Requirement 3: Schutz vor Command-Injection und Path-Traversal

**User Story:** Als Betreiber des lokalen Tools möchte ich, dass ein
übergebener Repository-Pfad keine beliebigen Shell-Befehle ausführen oder
beliebige Verzeichnisse auslesen kann, damit das Tool nicht für Angriffe
missbraucht werden kann.

#### Acceptance Criteria

1. THE Git_Reader SHALL den Git-Befehl ohne Shell-Interpolation des Repository_Pfads ausführen, indem der Repository_Pfad als Arbeitsverzeichnis und alle variablen Werte als separate Argumente übergeben werden.
2. IF der aufgelöste Repository_Pfad nicht auf ein existierendes Verzeichnis zeigt, das ein Git-Repository enthält, THEN THE Git_Reader SHALL eine Leere_Antwort zurückgeben.
3. THE Git_Reader SHALL die Datumswerte für den Git-Befehl ausschliesslich serverseitig aus den validierten Parametern `week` und `year` berechnen und keine vom Client gelieferten Datums-Zeichenketten an den Git-Befehl übergeben.
4. IF der Repository_Pfad Zeichen enthält, die ausserhalb der Menge zulässiger Pfadzeichen liegen (Shell-Metazeichen wie `;`, `|`, `&`, `$`, Backtick, Anführungszeichen), THEN THE Git_Reader SHALL eine Leere_Antwort zurückgeben.

### Requirement 4: Commits nach Wochentag gruppieren

**User Story:** Als Nutzer möchte ich die Commit-Titel den korrekten Wochentagen
zugeordnet sehen, damit die Stichworte beim richtigen Tag erscheinen.

#### Acceptance Criteria

1. THE Git_Reader SHALL ausschliesslich Commits berücksichtigen, deren Commit-Datum innerhalb der Kalenderwoche liegt, die durch `week` und `year` definiert ist.
2. WHEN ein Commit dem Wochentag Montag bis Freitag zugeordnet ist, THE Tagesgruppierung SHALL dessen Commit_Titel in die Liste des entsprechenden Wochentags aufnehmen.
3. WHERE ein Commit auf einen Samstag oder Sonntag fällt, THE Tagesgruppierung SHALL diesen Commit_Titel nicht in die Antwort aufnehmen.
4. THE Tagesgruppierung SHALL die Commit_Titel innerhalb eines Wochentags in chronologischer Reihenfolge (ältester zuerst) auflisten.
5. WHERE an einem Wochentag keine berücksichtigten Commits vorliegen, THE Tagesgruppierung SHALL für diesen Wochentag eine leere Liste zurückgeben.

### Requirement 5: Commits filtern

**User Story:** Als Nutzer möchte ich nur meine eigenen relevanten Commits sehen,
damit Merge-Commits und Beiträge anderer Personen meine Stichworte nicht
verfälschen.

#### Acceptance Criteria

1. THE Git_Reader SHALL ausschliesslich Commits berücksichtigen, deren Author dem Konfigurierten_Author des Ziel-Repositories entspricht.
2. THE Git_Reader SHALL jeden Merge_Commit von der Tagesgruppierung ausschliessen.
3. IF der Konfigurierte_Author nicht ermittelt werden kann, THEN THE Git_Reader SHALL die Author-Filterung auslassen und alle übrigen berücksichtigten Commits zurückgeben.

### Requirement 6: Fehlertolerante Verarbeitung

**User Story:** Als Nutzer möchte ich, dass das Tool bei fehlendem Repository
oder nicht verfügbarem Git nicht abstürzt, damit die App auch ohne lauffähige
Git-Umgebung bedienbar bleibt.

#### Acceptance Criteria

1. IF das Git-Kommandozeilenprogramm auf dem System nicht verfügbar ist, THEN THE Git_Reader SHALL eine Leere_Antwort zurückgeben.
2. IF die Ausführung des Git-Befehls einen Fehler signalisiert, THEN THE Git_Reader SHALL eine Leere_Antwort zurückgeben.
3. WHEN eine Leere_Antwort zurückgegeben wird, THE Git_Summary_API SHALL den HTTP-Statuscode 200 mit den unveränderten Werten `week` und `year` sowie fünf leeren Wochentags-Listen zurückgeben.
4. THE Git_Summary_API SHALL keine Roh-Fehlerausgaben des Git-Befehls und keinen absoluten Repository_Pfad an den Client zurückgeben.

### Requirement 7: Frontend-Integration in der Tages-Komponente

**User Story:** Als Nutzer möchte ich die Git-Stichworte mit einem Klick in das
Stichwort-Feld eines Wochentags laden, damit ich sie als Grundlage für die
Tagesgenerierung nutzen kann.

#### Acceptance Criteria

1. THE Git_Load_Button SHALL in der Tages-Komponente neben dem bestehenden Generieren-Button angezeigt werden.
2. WHEN der Nutzer den Git_Load_Button eines Wochentags auslöst, THE Tages-Komponente SHALL eine GET-Anfrage an `/api/git-summary` mit der aktuell gewählten Kalenderwoche und dem Jahr senden.
3. WHEN die Antwort der Git_Summary_API empfangen wurde, THE Tages-Komponente SHALL die Commit_Titel des betreffenden Wochentags in das zugehörige Stichwort_Feld einfügen.
4. WHEN Commit_Titel in ein Stichwort_Feld eingefügt werden, THE Tages-Komponente SHALL bereits vorhandenen Inhalt des Stichwort_Felds erhalten und die neuen Stichworte daran anfügen.
5. WHILE eine Git-Lade-Anfrage für einen Wochentag läuft, THE Tages-Komponente SHALL den Git_Load_Button dieses Wochentags deaktivieren.
6. IF während des Einfügens der Commit_Titel ein Fehler auftritt, THEN THE Tages-Komponente SHALL den bestehenden Inhalt des Stichwort_Felds vollständig unverändert lassen.
7. IF die Git-Lade-Anfrage fehlschlägt oder eine leere Liste für den Wochentag zurückgibt, THEN THE Tages-Komponente SHALL den bestehenden Inhalt des Stichwort_Felds unverändert lassen.

### Requirement 8: Konfiguration des Repository-Pfads

**User Story:** Als Nutzer möchte ich den Repository-Pfad über eine
Umgebungsvariable festlegen, damit ich den Pfad nicht bei jeder Anfrage angeben
muss.

#### Acceptance Criteria

1. THE Git_Summary_API SHALL den Repository_Pfad aus der Umgebungsvariable GIT_REPO_PATH lesen, WHEN kein `repoPath`-Query-Parameter übergeben wird.
2. THE Konfiguration SHALL die Variable GIT_REPO_PATH in der Datei `.env.example` mit beschreibendem Kommentar dokumentieren.
3. THE Git_Reader SHALL einen relativen Repository_Pfad gegen das Arbeitsverzeichnis des Servers auflösen, bevor der Git-Befehl ausgeführt wird.
