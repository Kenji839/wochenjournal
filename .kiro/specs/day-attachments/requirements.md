# Requirements Document

## Introduction

Dieses Feature erweitert den **Wochenjournal-Generator** so, dass pro Wochentag
(Mo–Fr) **optional** zusätzliche Anhänge erfasst werden können: **Bilder**,
**Code-Snippets** und **Links**. Diese Tagesanhänge ergänzen die bestehenden
Stichworte und den generierten Tagesabsatz. Sie fliessen in die
Gesamtjournal-Vorschau, in den Export (Kopieren / `.txt`-Download) und in den
**Confluence-Upload** ein.

Ein zweites, ausdrücklich gewünschtes Ziel ist die **Überprüfung und Erhaltung
von Links (und Bildern) im Confluence-Upload**. Eine Sichtung des bestehenden
Confluence-Konverters (`lib/confluence.ts`, `convertToStorageFormat`) zeigt:
Der Konverter maskiert aktuell sämtliche Sonderzeichen (`&`, `<`, `>`) und wandelt
nur `**fett**` um. Das bedeutet konkret:

- **Links werden heute nicht als klickbare Links übertragen.** Eine URL bleibt
  zwar als Text erhalten, wird aber als **maskierter Klartext** ausgegeben und ist
  in Confluence **nicht klickbar**.
- **Bilder werden heute gar nicht unterstützt** (kein Upload als Seitenanhang,
  keine Einbettung).

Die Annahme, dass der bestehende Upload Links und Bilder bereits abdeckt, trifft
daher **nicht** zu. Dieses Feature schliesst diese Lücke: Links sollen als
funktionierende Hyperlinks erhalten bleiben, Code als Code-Block dargestellt und
Bilder eingebettet werden – ohne das bestehende Verhalten (Absatztrennung,
Fett-Überschriften, Maskierung von Klartext) zu beschädigen.

Das Feature folgt den bestehenden Architektur- und Sicherheitsprinzipien: lokaler
Einzelnutzer-Betrieb, Persistenz ausschliesslich im Browser-`localStorage` (max.
10 Wochen) über `lib/storage.ts`, Confluence-Zugangsdaten nur serverseitig in
`process.env`. Es werden keine neuen npm-Dependencies eingeführt.

## Glossary

- **KW**: Kalenderwoche (1–53).
- **Woche / WeekJournal**: Alle Daten einer Kalenderwoche (5 Tage + Reflexion).
- **Tag / DayEntry**: Ein einzelner Wochentag (Mo–Fr) mit Stichworten, generiertem
  Tagesabsatz und – neu – Tagesanhängen.
- **Tagesanhang / Attachment**: Ein optionales, einem Tag zugeordnetes Element vom
  Typ Bild, Code_Snippet oder Link.
- **Bild / Image_Attachment**: Ein vom Nutzer ausgewähltes Rasterbild (PNG, JPEG,
  GIF oder WEBP) mit optionaler Bildunterschrift.
- **Code_Snippet**: Ein Tagesanhang mit Quelltext und optionaler Sprachangabe.
- **Link_Attachment**: Ein Tagesanhang mit einer URL und einem optionalen Anzeigetext.
- **Day_Attachment_Editor**: Der UI-Bereich innerhalb einer Tageskarte, über den
  Tagesanhänge erfasst, angezeigt und entfernt werden.
- **Journal_Composer**: Die Logik in `lib/journal.ts`, die eine Woche zum
  Gesamtjournal-Text zusammensetzt (`composeJournal`).
- **Storage**: Die Persistenzschicht `lib/storage.ts` (Browser-`localStorage`).
- **Storage_Converter**: Die Funktion in `lib/confluence.ts`
  (`convertToStorageFormat`), die Journalinhalte in das Confluence-Storage_Format
  (XHTML) umwandelt.
- **Storage_Format**: Das von Confluence erwartete XHTML-basierte „storage“-Format.
- **Confluence_Client**: Serverseitiges Modul, das mit der Confluence-REST-API
  kommuniziert (Suchen, Erstellen, Aktualisieren von Seiten, Hochladen von
  Bild-Anhängen).
- **Upload_Endpoint**: Der serverseitige Route Handler `POST /api/confluence`.
- **Export**: Das Kopieren in die Zwischenablage und der `.txt`-Download des
  Gesamtjournals.
- **System**: Die Wochenjournal-Generator-Anwendung als Ganzes.

## Requirements

### Requirement 1: Tagesanhänge optional erfassen

**User Story:** Als Lernender möchte ich an einem Wochentag optional Bilder,
Code-Snippets und Links erfassen, damit ich meinen Tagesabsatz mit zusätzlichem
Material belegen kann.

#### Acceptance Criteria

1. THE Day_Attachment_Editor SHALL für jeden Wochentag (Mo–Fr) je ein
   Bedienelement bereitstellen, um einen Tagesanhang vom Typ Bild, Code_Snippet
   oder Link hinzuzufügen.
2. THE System SHALL einen Tag ohne Tagesanhänge als gültigen Tag behandeln, sodass
   Tagesanhänge optional bleiben.
3. WHEN der Nutzer das Entfernen-Bedienelement eines Tagesanhangs eines Tages
   betätigt, THE System SHALL diesen Tagesanhang aus dem betroffenen Tag entfernen
   und die übrigen Tagesanhänge dieses Tages unverändert in ihrer Reihenfolge
   beibehalten.
4. THE System SHALL die Tagesanhänge eines Tages in der Reihenfolge ihres
   Hinzufügens anzeigen.
5. WHILE eine Generierung oder ein Upload für die aktive Woche läuft, THE
   Day_Attachment_Editor SHALL die Bedienelemente zum Hinzufügen und Entfernen von
   Tagesanhängen deaktivieren.
6. THE Day_Attachment_Editor SHALL höchstens 10 Tagesanhänge je Tag zulassen.
7. IF ein Tag bereits 10 Tagesanhänge besitzt, THEN THE System SHALL keinen
   weiteren Tagesanhang hinzufügen, die bestehenden Tagesanhänge unverändert
   beibehalten und einen Hinweis auf die maximale Anzahl (10) anzeigen.

### Requirement 2: Link-Anhang erfassen

**User Story:** Als Lernender möchte ich einem Tag einen Link mit optionalem
Anzeigetext hinzufügen, damit ich auf relevante Ressourcen verweisen kann.

#### Acceptance Criteria

1. WHEN der Nutzer einen Link_Attachment mit einer URL hinzufügt, die nach
   Entfernen umschliessender Leerzeichen mit `http://` oder `https://` beginnt,
   THE System SHALL den Link_Attachment dem betroffenen Tag mit dieser URL und dem
   optionalen Anzeigetext hinzufügen und ihn als letzten Tagesanhang dieses Tages
   einreihen.
2. IF die erfasste URL nach Entfernen umschliessender Leerzeichen leer ist, THEN
   THE System SHALL den Link_Attachment nicht hinzufügen, den erfassten
   Eingabewert unverändert beibehalten und einen Hinweis anzeigen, dass eine URL
   erforderlich ist.
3. IF die erfasste URL nach Entfernen umschliessender Leerzeichen nicht mit
   `http://` oder `https://` beginnt, THEN THE System SHALL den Link_Attachment
   nicht hinzufügen, den erfassten Eingabewert unverändert beibehalten und einen
   Hinweis auf eine gültige URL anzeigen.
4. IF die erfasste URL nach Entfernen umschliessender Leerzeichen mehr als 2048
   Zeichen umfasst oder der erfasste Anzeigetext mehr als 200 Zeichen umfasst,
   THEN THE System SHALL den Link_Attachment nicht hinzufügen, den erfassten
   Eingabewert unverändert beibehalten und einen Hinweis auf die maximal zulässige
   Länge anzeigen.
5. WHERE ein Link_Attachment keinen Anzeigetext besitzt, THE System SHALL die URL
   selbst als Anzeigetext verwenden.

### Requirement 3: Code-Snippet erfassen

**User Story:** Als Lernender möchte ich einem Tag ein Code-Snippet mit optionaler
Sprachangabe hinzufügen, damit ich relevante Code-Ausschnitte dokumentieren kann.

#### Acceptance Criteria

1. WHEN der Nutzer ein Code_Snippet hinzufügt, dessen Quelltext nach Entfernen
   umschliessender Leerzeichen mindestens ein Zeichen enthält und höchstens
   100'000 Zeichen umfasst, THE System SHALL das Code_Snippet dem betroffenen Tag
   mit dem unveränderten erfassten Quelltext und der optionalen Sprachangabe
   hinzufügen.
2. IF der erfasste Quelltext nach Entfernen umschliessender Leerzeichen leer ist,
   THEN THE System SHALL das Code_Snippet nicht hinzufügen und einen Hinweis
   anzeigen, dass Quelltext erforderlich ist.
3. IF der erfasste Quelltext mehr als 100'000 Zeichen umfasst, THEN THE System
   SHALL das Code_Snippet nicht hinzufügen und einen Hinweis auf die maximale
   Länge des Quelltextes (100'000 Zeichen) anzeigen.
4. IF die erfasste Sprachangabe länger als 30 Zeichen ist, THEN THE System SHALL
   das Code_Snippet nicht hinzufügen und einen Hinweis auf die maximale Länge der
   Sprachangabe (30 Zeichen) anzeigen.
5. THE System SHALL den erfassten Quelltext eines Code_Snippets inklusive
   Zeilenumbrüchen, Einrückungen und umschliessender Leerzeichen unverändert
   speichern, ohne ihn zu kürzen oder zu trimmen.

### Requirement 4: Bild-Anhang erfassen

**User Story:** Als Lernender möchte ich einem Tag ein Bild hinzufügen, damit ich
visuelles Material zu meiner Arbeit festhalten kann.

#### Acceptance Criteria

1. WHEN der Nutzer eine gültige Bilddatei vom Typ PNG, JPEG, GIF oder WEBP mit
   einer Grösse von mindestens 1 Byte bis höchstens 2'000'000 Byte auswählt, THE
   System SHALL ein Image_Attachment für den betroffenen Tag erzeugen, das die
   Bilddaten und den ursprünglichen Dateinamen speichert.
2. IF die ausgewählte Datei nicht vom Typ PNG, JPEG, GIF oder WEBP ist, THEN THE
   System SHALL das Image_Attachment nicht erzeugen und einen Hinweis auf die
   unterstützten Bildformate anzeigen.
3. IF die ausgewählte Bilddatei grösser als 2'000'000 Byte (2 Megabyte) ist, THEN
   THE System SHALL das Image_Attachment nicht erzeugen und einen Hinweis auf die
   maximale Bildgrösse (2'000'000 Byte) anzeigen, wobei genau 2'000'000 Byte noch
   zulässig sind.
4. IF die ausgewählte Bilddatei 0 Byte gross ist, THEN THE System SHALL das
   Image_Attachment nicht erzeugen und einen Hinweis anzeigen, dass die Datei leer
   ist.
5. WHERE ein Image_Attachment vorhanden ist, THE System SHALL eine Vorschau des
   Bildes im Day_Attachment_Editor anzeigen.
6. THE System SHALL pro Image_Attachment eine optionale Bildunterschrift mit
   höchstens 200 Zeichen erfassen können.

### Requirement 5: Tagesanhänge persistieren

**User Story:** Als Lernender möchte ich, dass erfasste Tagesanhänge zusammen mit
der Woche gespeichert werden, damit sie nach dem Neuladen erhalten bleiben.

#### Acceptance Criteria

1. WHEN der Nutzer einen Tagesanhang hinzufügt oder entfernt, THE Storage SHALL
   unmittelbar nach dieser Änderung die geänderte Woche inklusive aller
   Tagesanhänge jedes Tages – mit deren Typ, Reihenfolge und vollständigem Inhalt
   (Link: URL und Anzeigetext; Code_Snippet: Quelltext und Sprachangabe; Bild:
   Bilddaten und Bildunterschrift) – im Browser-`localStorage` speichern.
2. WHEN eine zuvor gespeicherte Woche geladen wird, THE System SHALL die
   Tagesanhänge jedes Tages in der gespeicherten Reihenfolge und mit unverändertem
   Typ und Inhalt (Link: URL und Anzeigetext; Code_Snippet: Quelltext inklusive
   Zeilenumbrüchen und Einrückungen sowie Sprachangabe; Bild: Bilddaten und
   Bildunterschrift) wiederherstellen.
3. IF das Speichern einer Woche an der Speicherbegrenzung des Browsers scheitert,
   THEN THE System SHALL den zuvor im `localStorage` gespeicherten Stand
   unverändert beibehalten, den hinzugefügten oder entfernten Tagesanhang nicht in
   den `localStorage` übernehmen und einen Hinweis anzeigen, der angibt, dass der
   Tagesanhang wegen erreichter Speicherbegrenzung nicht gespeichert werden konnte.

### Requirement 6: Tagesanhänge in Vorschau und Export einbeziehen

**User Story:** Als Lernender möchte ich meine Tagesanhänge in der
Gesamtjournal-Vorschau und im Textexport sehen, damit das Journal vollständig ist.

#### Acceptance Criteria

1. WHERE ein Tag Tagesanhänge besitzt, THE Journal_Composer SHALL die Tagesanhänge
   dieses Tages – typunabhängig und in der gespeicherten Reihenfolge – nach dem
   generierten Tagesabsatz dieses Tages ausgeben.
2. WHERE der Anzeigetext eines Link_Attachment von dessen URL abweicht, THE
   Journal_Composer SHALL den Link im Export als Anzeigetext gefolgt von der URL
   in runden Klammern ausgeben.
3. WHERE der Anzeigetext eines Link_Attachment der URL entspricht, THE
   Journal_Composer SHALL die URL im Export nur einmal ausgeben.
4. THE Journal_Composer SHALL den Quelltext eines Code_Snippets im Export
   inklusive Zeilenumbrüchen und Einrückungen unverändert ausgeben und, sofern
   vorhanden, dessen Sprachangabe voranstellen.
5. THE Journal_Composer SHALL ein Image_Attachment im Textexport durch einen
   erkennbaren Bild-Platzhalter mit dessen Bildunterschrift, oder – falls keine
   vorhanden ist – mit dessen Dateinamen kennzeichnen.
6. WHERE ein Tag keine Tagesanhänge besitzt, THE Journal_Composer SHALL den
   Tagesabschnitt unverändert und ohne Platzhalter ausgeben.

### Requirement 7: Links im Confluence-Upload als klickbare Hyperlinks erhalten

**User Story:** Als Lernender möchte ich, dass meine Links nach dem
Confluence-Upload klickbar bleiben, damit ich sie in Confluence direkt öffnen kann.

#### Acceptance Criteria

1. WHEN eine Woche mit mindestens einem Link_Attachment nach Confluence
   hochgeladen wird, THE Storage_Converter SHALL jeden Link_Attachment als
   Confluence-Hyperlink (`<a href="…">…</a>`) ausgeben, dessen `href`-Attribut die
   URL des Link_Attachment enthält.
2. THE Storage_Converter SHALL den Anzeigetext eines Link_Attachment als
   sichtbaren Linktext zwischen den Anker-Tags ausgeben.
3. THE Storage_Converter SHALL jede in einem Link_Attachment enthaltene URL
   Zeichen für Zeichen ohne Kürzung, Weglassen oder Umschreiben als Linkziel
   übertragen, sodass kein Link zu maskiertem Klartext reduziert wird.
4. THE Storage_Converter SHALL im sichtbaren Linktext die Sonderzeichen `&`, `<`
   und `>` gemäss XHTML maskieren.
5. THE Storage_Converter SHALL im Wert des `href`-Attributs die Sonderzeichen `&`,
   `<`, `>` und `"` gemäss XHTML maskieren, sodass die Ausgabe wohlgeformtes
   Storage_Format bleibt.

### Requirement 8: Code-Snippets und Bilder im Confluence-Upload übertragen

**User Story:** Als Lernender möchte ich, dass meine Code-Snippets und Bilder in
Confluence dargestellt werden, damit die hochgeladene Seite mein Material vollständig
zeigt.

#### Acceptance Criteria

1. WHEN eine Woche mit mindestens einem Code_Snippet hochgeladen wird, THE
   Storage_Converter SHALL das Code_Snippet als Confluence-Code-Block ausgeben und
   dessen Quelltext inklusive Zeilenumbrüchen und Einrückungen unverändert
   übernehmen.
2. THE Storage_Converter SHALL innerhalb des Confluence-Code-Blocks die
   Sonderzeichen `&`, `<` und `>` gemäss XHTML maskieren, sodass die Ausgabe
   wohlgeformtes Storage_Format bleibt und kein Quelltextzeichen verloren geht oder
   verändert wird.
3. WHERE ein Code_Snippet eine Sprachangabe besitzt, THE Storage_Converter SHALL
   diese Sprachangabe an den Confluence-Code-Block übergeben.
4. WHERE ein Code_Snippet keine Sprachangabe besitzt, THE Storage_Converter SHALL
   den Confluence-Code-Block ohne Sprachangabe ausgeben.
5. WHEN eine Woche mit mindestens einem Image_Attachment hochgeladen wird, THE
   Confluence_Client SHALL jedes Image_Attachment als Anhang der KW-Seite
   hochladen und im Tagesabschnitt des Tages einbetten, dem das Image_Attachment
   zugeordnet ist, in der gespeicherten Reihenfolge der Tagesanhänge dieses Tages.
6. IF das Hochladen oder Einbetten eines Image_Attachment fehlschlägt, THEN THE
   Upload_Endpoint SHALL den Upload abbrechen, keine KW-Seite mit fehlerhaften
   Bildverweisen veröffentlichen und mit einem Fehlerstatus sowie einer
   generischen Fehlermeldung ohne Zugangsdaten antworten.

### Requirement 9: Bestehendes Konvertierungsverhalten bewahren (Regression)

**User Story:** Als Lernender möchte ich, dass der erweiterte Confluence-Upload das
bisherige Verhalten beibehält, damit bestehende Journale unverändert korrekt
hochgeladen werden.

#### Acceptance Criteria

1. THE Storage_Converter SHALL nur gepaarte `**…**`-Markierungen als
   `<strong>…</strong>` ausgeben; ungepaarte `**` bleiben unverändert als Literal
   erhalten.
2. THE Storage_Converter SHALL jede nicht-leere Zeile als genau einen Absatz und
   jede Leerzeile als leeren Absatz ausgeben, sodass die Absatztrennung erhalten
   bleibt.
3. THE Storage_Converter SHALL in Klartext, der weder Link, Code_Snippet noch Bild
   ist, `&` als `&amp;`, `<` als `&lt;` und `>` als `&gt;` maskieren, ohne bereits
   maskierte Sequenzen doppelt zu maskieren.
4. THE Storage_Converter SHALL für jeden Journalinhalt wohlgeformtes XHTML im
   Confluence-Storage_Format ausgeben.
