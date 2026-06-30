# Implementation Plan: Tagesanhänge (day-attachments)

## Overview

Die Umsetzung folgt dem Datenfluss des Designs und baut inkrementell von den
Typen über die reine Logik (`lib/`) bis zur UI und zum Confluence-Upload auf.
Jeder Schritt baut auf dem vorherigen auf und endet integriert – es bleibt kein
verwaister Code stehen. Sprache: **TypeScript (strict)** wie im bestehenden
Projekt. Es werden **keine neuen npm-Dependencies** eingeführt; Property-Tests
nutzen das bereits installierte **vitest + fast-check** (min. 100 Runs,
Tag-Kommentare im Format aus `lib/journal.test.ts`). Alle nutzerseitigen Strings
in **Schweizer Hochdeutsch** (kein „ß", immer „ss"). Änderungen bleiben
chirurgisch.

Verifikation nach Code-Änderungen: `npm run lint`, `npx tsc --noEmit`,
`npm run test` und – bei Änderungen unter `app/` – `npm run build`.

## Tasks

- [x] 1. Typen für Tagesanhänge erweitern (`types/journal.ts`)
  - `AttachmentBase` (mit `id: string`) sowie `ImageAttachment`, `CodeAttachment`,
    `LinkAttachment` und die diskriminierte Union `Attachment` ergänzen
  - `DayEntry` additiv um `attachments?: Attachment[]` erweitern (optional für
    Abwärtskompatibilität beim Laden)
  - `ConfluenceUploadRequest` um `days: DayEntry[]` und `reflexion: string`
    erweitern (Quelle der Wahrheit für Request/Persistenz synchron halten)
  - _Requirements: 5.1, 5.2, 8.5_

- [x] 2. Reine Anhang-Logik in `lib/attachments.ts` (neu, JSX-frei)
  - [x] 2.1 Konstanten, `ValidationResult<T>` und Validatoren implementieren
    - Limits als `UPPER_SNAKE_CASE` (`MAX_ATTACHMENTS_PER_DAY`, `MAX_URL_LENGTH`,
      `MAX_DISPLAY_TEXT_LENGTH`, `MAX_CODE_LENGTH`, `MAX_LANGUAGE_LENGTH`,
      `MAX_CAPTION_LENGTH`, `MAX_IMAGE_BYTES`, `ALLOWED_IMAGE_MIME`)
    - `validateLink(rawUrl, rawDisplayText)`: trimmt URL, prüft `http://`/`https://`,
      Längen (URL ≤ 2048, Anzeigetext ≤ 200); leerer Anzeigetext entfällt
    - `validateCode(source, rawLanguage)`: getrimmter Quelltext ≥ 1, `source.length`
      ≤ 100 000, getrimmte Sprache ≤ 30; speichert `source` **ungetrimmt/unverändert**
    - `validateImageMeta({ mimeType, byteSize, caption })`: MIME in erlaubter Menge,
      `1 ≤ byteSize ≤ 2 000 000` (inklusiv), Bildunterschrift ≤ 200
    - Fehlerhinweise in Schweizer Hochdeutsch zurückgeben (kein Wert wird verändert)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 2.2 `addAttachment` und `removeAttachment` implementieren
    - `addAttachment(day, attachment)`: hängt als letztes Element an, solange
      `< MAX_ATTACHMENTS_PER_DAY`; bei erreichtem Limit Tag unverändert + Hinweis
    - `removeAttachment(day, attachmentId)`: entfernt genau das Ziel, übrige in
      Reihenfolge; `day.attachments ?? []` als Basis
    - _Requirements: 1.3, 1.4, 1.6, 1.7_

  - [x]* 2.3 Property-Test: Hinzufügen erhält Reihenfolge und begrenzt auf 10
    - **Property 1: Hinzufügen erhält Einfügereihenfolge und begrenzt auf 10**
    - **Validates: Requirements 1.4, 1.6, 1.7**
    - `lib/attachments.test.ts`, `{ numRuns: 100 }`, Tag-Kommentar
      `// Feature: day-attachments, Property 1: …`

  - [x]* 2.4 Property-Test: Entfernen trifft genau das Ziel, bewahrt Reihenfolge
    - **Property 2: Entfernen entfernt genau das Ziel und bewahrt die Reihenfolge**
    - **Validates: Requirements 1.3**

  - [x]* 2.5 Property-Test: Link-Validierung
    - **Property 3: Link-Validierung**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - Arbitraries mit Grenzlängen (knapp ober-/unterhalb 2048/200) und
      Whitespace-only / falschem Präfix

  - [x]* 2.6 Property-Test: Code-Validierung und unveränderte Quelltextspeicherung
    - **Property 4: Code-Validierung und unveränderte Quelltextspeicherung**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
    - Bei Akzeptanz: gespeicherter `source` zeichengleich zur Eingabe

  - [x]* 2.7 Property-Test: Bild-Metadaten-Validierung
    - **Property 5: Bild-Metadaten-Validierung**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6**
    - Grenze 2 000 000 Byte inklusiv, 0 Byte und nicht-erlaubte MIME-Typen

- [x] 3. Checkpoint – Anhang-Logik verifizieren
  - `npm run lint`, `npx tsc --noEmit`, `npm run test` ausführen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Persistenz mit Schreibergebnis (`lib/storage.ts`)
  - [x] 4.1 `saveWeekChecked` einführen, `saveWeek` als Wrapper erhalten
    - `saveWeekChecked(week): { weeks; persisted }` gibt das Schreibergebnis nach
      aussen; bei `persisted === false` bleibt der gespeicherte Stand unverändert
      (Rollback) und die unveränderte Vorliste wird zurückgegeben
    - `saveWeek` ruft `saveWeekChecked(week).weeks` (Signatur + bestehende Tests
      bleiben intakt)
    - _Requirements: 5.1, 5.3_

  - [x]* 4.2 Property-Test: Persistenz-Round-Trip erhält Anhänge vollständig
    - **Property 6: Persistenz-Round-Trip erhält Anhänge vollständig**
    - **Validates: Requirements 5.1, 5.2**
    - Wochen-Arbitrary inkl. Tage mit Link-/Code-/Bild-Anhängen; `JSON.parse(JSON.stringify(week))`

  - [x]* 4.3 Beispiel-Test: Quota-Fehler liefert `persisted:false` + Rollback
    - `window.localStorage`-Mock, dessen `setItem` wirft → `saveWeekChecked`
      liefert `persisted:false` und die unveränderte Vorliste (Mock-Stil aus
      `lib/storage.test.ts`)
    - _Requirements: 5.3_

- [x] 5. Anhänge in Vorschau/Export (`lib/journal.ts` – `composeJournal`)
  - [x] 5.1 Anhang-Ausgabe je Tag nach dem Tagesabsatz implementieren
    - Anhänge in gespeicherter Reihenfolge nach dem Tagesabsatz ausgeben
      (`day.attachments ?? []`); Tag ohne Anhänge bleibt unverändert ohne Platzhalter
    - Link: `Anzeigetext (url)`, falls Anzeigetext vorhanden und ≠ url, sonst nur `url`
    - Code: optionale Sprachzeile vorangestellt, danach `source` **unverändert**
    - Bild: erkennbarer Platzhalter `[Bild: <caption|filename>]`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 2.5_

  - [x]* 5.2 Property-Test: Komposition gibt Anhänge nach dem Absatz in Reihenfolge aus
    - **Property 7: Komposition gibt Anhänge nach dem Tagesabsatz in Reihenfolge aus**
    - **Validates: Requirements 6.1, 6.6**

  - [x]* 5.3 Property-Test: Export-Formatierung je Anhangtyp
    - **Property 8: Export-Formatierung je Anhangtyp**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 2.5**

- [x] 6. Checkpoint – Logik-Schicht (lib) verifizieren
  - `npm run lint`, `npx tsc --noEmit`, `npm run test` ausführen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Confluence-Renderer und Wochenkonverter (`lib/confluence.ts`)
  - [x] 7.1 `escapeAttr` und reine Renderer `renderLink`/`renderCode`/`renderImageMacro`
    - `escapeAttr`: maskiert `& < > "` (& zuerst); bestehende `escapeXml`,
      `applyBold`, `convertToStorageFormat` **verhaltensgleich** belassen
    - `renderLink`: `<a href="ESC_ATTR(url)">ESC_TEXT(displayText ?? url)</a>`,
      URL zeichengetreu (nur maskiert) ins `href`
    - `renderCode`: `ac:structured-macro name="code"` mit optionalem
      `language`-Parameter und `escapeXml`-maskiertem `ac:plain-text-body`
    - `renderImageMacro`: `<ac:image ac:alt="…"><ri:attachment ri:filename="…" /></ac:image>`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 7.2 `convertWeekToStorageFormat(input, imageFilenames)` implementieren
    - Aufbau: Header → „Was habe ich…"-Überschrift → je Tag (`Label: text` über
      bestehende `convertToStorageFormat`-Textkonvertierung, danach die
      Anhang-XHTML in gespeicherter Reihenfolge) → Reflexion
    - Bild-Makros referenzieren den je Anhang vergebenen Dateinamen aus `imageFilenames`
    - _Requirements: 7.1, 8.1, 8.5_

  - [x]* 7.3 Property-Test: Link-Konvertierung erzeugt wohlgeformten Anker mit exaktem Ziel
    - **Property 9: Link-Konvertierung erzeugt wohlgeformten Anker mit exaktem Ziel**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    - Helper `unescapeXml`/`unescapeAttr` für Round-Trip; Strings mit `& < > "`

  - [x]* 7.4 Property-Test: Code-Konvertierung ist verlustfrei mit korrektem Sprachparameter
    - **Property 10: Code-Konvertierung ist verlustfrei (Round-Trip) mit korrektem Sprachparameter**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x]* 7.5 Property-Test: Bild-Makros liegen im richtigen Tagesabschnitt in Reihenfolge
    - **Property 11: Bild-Makros liegen im richtigen Tagesabschnitt in Reihenfolge**
    - **Validates: Requirements 8.5**

  - [x]* 7.6 Property-Test: Gepaarte Fett-Markierung bleibt erhalten
    - **Property 12: Gepaarte Fett-Markierung bleibt erhalten**
    - **Validates: Requirements 9.1**

  - [x]* 7.7 Property-Test: Absatzstruktur pro Zeile
    - **Property 13: Absatzstruktur pro Zeile**
    - **Validates: Requirements 9.2**

  - [x]* 7.8 Property-Test: Klartext-Maskierung ohne Doppel-Maskierung
    - **Property 14: Klartext-Maskierung ohne Doppel-Maskierung**
    - **Validates: Requirements 9.3**

  - [x]* 7.9 Property-Test: Wohlgeformtes XHTML für jeden Inhalt
    - **Property 15: Wohlgeformtes XHTML für jeden Inhalt**
    - **Validates: Requirements 9.4**
    - Struktureller Well-Formedness-Check (balancierte Tags, gequotete Attribute,
      legale Entities); Anhang-XHTML in Wurzelelement mit `ac:`/`ri:`-Namespaces kapseln

  - [x]* 7.10 Regressions-Beispieltests: bestehendes `convertToStorageFormat`-Verhalten
    - Konkrete Eingaben festschreiben: gepaarte/ungepaarte `**`, Leerzeilen, `& < >`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 8. Bild-Upload im Confluence-Client (`lib/confluence.ts`)
  - [x] 8.1 `uploadJournal` um strukturierte Eingabe und Bild-Upload erweitern
    - Eingabe: strukturierte Tage + Bildanhänge (Base64 + MIME + Dateiname);
      eindeutiger Anhang-Dateiname je Bild aus dessen `id`
    - Ablauf: Seite sicherstellen (vorhandene finden oder Body **ohne** Bild-Makros
      erstellen) → alle Bilder als Anhang hochladen → **erst bei Erfolg** Body inkl.
      Bild-Makros (über `convertWeekToStorageFormat`) schreiben
    - Neuer Helper `uploadAttachment(config, pageId, filename, bytes, mimeType)`
      (multipart `file`, Header `X-Atlassian-Token: no-check`); Fehler über die
      bestehende generische `confluenceFetch`-Strategie (keine Zugangsdaten/URLs/Bodies)
    - Bei fehlgeschlagenem Bild-Upload abbrechen, bevor ein Body mit Makros entsteht
    - _Requirements: 8.5, 8.6_

  - [x]* 8.2 Integrationstest: erfolgreicher Bild-Upload-Ablauf
    - `fetch` gemockt: Seite sicherstellen → alle Bilder hochladen → Body-Update mit
      Bild-Makros (Reihenfolge/Tageszuordnung geprüft)
    - _Requirements: 8.5_

  - [x]* 8.3 Integrationstest: Abbruch bei fehlgeschlagenem Bild-Upload
    - `fetch` gemockt: Bild-Upload schlägt fehl → **kein** Body-Update mit Bild-Makros;
      Fehler wird generisch ohne Zugangsdaten propagiert
    - _Requirements: 8.6_

- [x] 9. Checkpoint – Confluence-Schicht verifizieren
  - `npm run lint`, `npx tsc --noEmit`, `npm run test` ausführen
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Upload-Endpoint erweitern (`app/api/confluence/route.ts`)
  - Erweiterten Request validieren (zusätzlich `days` als Array, `reflexion` als
    String) und an `uploadJournal` durchreichen
  - Bestehende Status-/Fehlerlogik beibehalten (`ConfigError` → 500, sonst → 502,
    generische Meldung ohne Zugangsdaten)
  - _Requirements: 8.5, 8.6_

- [x] 11. Day_Attachment_Editor in `components/DayCard.tsx`
  - Additive Props `onAddAttachment(attachment)` und `onRemoveAttachment(attachmentId)`
    (bestehende Signatur erhalten)
  - Drei Bedienelemente (Link / Code / Bild) zum Hinzufügen; Eingaben über
    `lib/attachments.ts` validieren, Hinweise (Schweizer Hochdeutsch) anzeigen und
    Eingabewerte bei Fehler stehen lassen
  - Bild: `FileReader` liest die Datei als Base64 (ohne Data-URL-Präfix);
    Metadaten über `validateImageMeta`
  - Anhangliste in `day.attachments`-Reihenfolge mit Entfernen-Button je Eintrag;
    Bilder mit Vorschau (`<img>` aus Base64-Data-URL)
  - Alle Hinzufügen/Entfernen-Elemente `disabled`, solange `busy` (Generierung/Upload)
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 4.5_

- [x] 12. Callbacks und Quota-Hinweis in `app/page.tsx`
  - Callbacks `addAttachment(weekday, attachment)` und
    `removeAttachment(weekday, attachmentId)` über `lib/attachments.ts` und
    `commitWeek` persistieren; an `DayCard` durchreichen
  - `commitWeek` wertet das Ergebnis von `saveWeekChecked` aus: bei `persisted === false`
    State **nicht** ändern und über `setError` einen Hinweis auf die erreichte
    Speicherbegrenzung anzeigen (Schweizer Hochdeutsch)
  - Laufender Upload sperrt die Anhang-Bedienelemente (in `busy` einbeziehen)
  - _Requirements: 1.5, 5.1, 5.3_

- [x] 13. Strukturierten Upload-Request in `components/JournalPreview.tsx`
  - Upload-Body um `days: week.days` und `reflexion: week.reflexion` erweitern
    (zusätzlich zum bestehenden `journalText`, `kw`, `jahr`)
  - _Requirements: 7.1, 8.1, 8.5_

- [x] 14. Abschluss-Checkpoint – Gesamtverifikation
  - `npm run lint`, `npx tsc --noEmit`, `npm run test` und `npm run build` ausführen
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Mit `*` markierte Sub-Tasks sind optional (Tests) und können für einen
  schnelleren MVP übersprungen werden; Top-Level-Tasks sind nie optional.
- Jeder Task referenziert die konkreten (Sub-)Requirements zur Nachverfolgbarkeit.
- Property-Tests nutzen vitest + fast-check mit `{ numRuns: 100 }` und Tag-Kommentaren
  im Format `// Feature: day-attachments, Property {N}: {Kurztext}` (Konvention aus
  `lib/journal.test.ts`).
- Property-Tests liegen nahe an der jeweiligen Implementierung (frühes Erkennen von
  Fehlern); reine Logik in `lib/` ist PBT-geeignet, externe Anteile (Confluence-Upload,
  Quota) werden als Integrations-/Beispieltests abgedeckt.
- Rein darstellungsbezogene Kriterien (1.1, 1.5, 4.5) werden zusätzlich manuell
  verifiziert (node-Testumgebung ohne DOM).
- Keine neuen npm-Dependencies; TypeScript strict; chirurgische Änderungen;
  nutzerseitige Strings in Schweizer Hochdeutsch.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "4.1", "5.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "7.2", "4.2", "5.2"] },
    { "id": 3, "tasks": ["8.1", "2.3", "4.3", "5.3", "11"] },
    { "id": 4, "tasks": ["2.4", "7.3", "10", "12", "13"] },
    { "id": 5, "tasks": ["2.5", "7.4"] },
    { "id": 6, "tasks": ["2.6", "7.5"] },
    { "id": 7, "tasks": ["2.7", "7.6"] },
    { "id": 8, "tasks": ["7.7"] },
    { "id": 9, "tasks": ["7.8"] },
    { "id": 10, "tasks": ["7.9"] },
    { "id": 11, "tasks": ["7.10"] },
    { "id": 12, "tasks": ["8.2"] },
    { "id": 13, "tasks": ["8.3"] }
  ]
}
```

Wave-Begründung (Datei-Konflikte vermieden):
- `lib/confluence.ts` (7.1 → 7.2 → 8.1) und `lib/attachments.ts` (2.1 → 2.2)
  liegen je in getrennten Wellen, da derselbe Code inkrementell wächst.
- Property-/Beispieltests, die dieselbe Testdatei schreiben, sind über Wellen
  verteilt: `lib/attachments.test.ts` (2.3–2.7), `lib/confluence.test.ts`
  (7.3–7.10, 8.2, 8.3), `lib/storage.test.ts` (4.2, 4.3) und die `journal`-Tests
  (5.2, 5.3) erscheinen nie zweimal in derselben Welle.
- Setup-/Implementierungstasks (Typen, reine `lib`-Logik) liegen in frühen Wellen,
  Tests und UI-/Endpoint-Verdrahtung folgen in späteren.
