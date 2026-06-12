# Implementation Plan: Confluence-Upload

## Overview

Umsetzung in **TypeScript** (strict), aufbauend auf der bestehenden Architektur
(`route.ts` ↔ `lib/`). Reihenfolge: zuerst geteilte Typen und Konfigurations-
vorlage, dann die reine Logik in `lib/confluence.ts` (Konfiguration, Titel,
Storage-Konvertierung), danach der Confluence-Client (Suchen/Erstellen/
Aktualisieren via eingebautem `fetch`), anschliessend der Route Handler
`POST /api/confluence` und zuletzt die UI in `JournalPreview.tsx`. Jeder Schritt
baut auf dem vorigen auf und endet mit der Verifikation
(`npm run lint`, `npx tsc --noEmit`, bei Bedarf `npm run build`).

**Keine neuen Laufzeit-Dependencies** – ausschliesslich das eingebaute `fetch`.
Einzige Ausnahme: ein optionales, rein dev-seitiges PBT-Setup (`fast-check` +
schlanker Test-Runner), das nur benötigt wird, wenn die mit `*` markierten
Property-/Unit-Test-Aufgaben umgesetzt werden.

> **Hinweis zur Seitensuche (Req 4.1):** Statt einer space-weiten Titelsuche
> (`?spaceKey=…&title=…`) werden die **direkten Unterseiten der Wurzelseite**
> gelistet (`GET /rest/api/content/{rootPageId}/child/page?limit=250`) und per
> exaktem `title` abgeglichen. Das vermeidet Titelkollisionen anderswo im Space
> und erfüllt Req 4.1 (Prüfung auf vorhandene Seite anhand des Page_Title).

## Tasks

- [ ] 1. Geteilte Typen und Konfigurationsvorlage vorbereiten
  - [x] 1.1 Confluence-Request/-Response-Typen zu `types/journal.ts` hinzufügen
    - `ConfluenceUploadRequest` (`journalText: string`, `kw: number`, `jahr: number`)
    - `ConfluenceUploadResponse` (`action: "created" | "updated"`)
    - Als benannte Exporte ergänzen, bestehende Typen unverändert lassen
    - _Requirements: 6.4, 6.5_

  - [x] 1.2 `.env.example` um die fünf `CONFLUENCE_*`-Variablen ergänzen
    - `CONFLUENCE_USERNAME`, `CONFLUENCE_PAT`, `CONFLUENCE_BASE_URL`,
      `CONFLUENCE_SPACE_KEY`, `CONFLUENCE_ROOT_PAGE_ID` mit erklärenden Kommentaren
    - Ohne echte Werte, ohne `NEXT_PUBLIC_`-Präfix
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 1.3 Dev-seitiges PBT-/Test-Setup einrichten (nur falls Test-Aufgaben umgesetzt werden)
    - `fast-check` und einen schlanken Test-Runner (z. B. `vitest`) als
      `devDependencies` installieren; Test-Skript ergänzen, mit `--run` (kein Watch)
    - Keine Laufzeit-Dependency; Produktionsbundle bleibt unberührt
    - _Requirements: (Test-Infrastruktur für Properties 1–6)_

- [ ] 2. Reine Logik in `lib/confluence.ts`: Konfiguration, Titel, Storage-Konvertierung
  - [x] 2.1 `loadConfig()` und `ConfigError` implementieren
    - Liest die fünf `CONFLUENCE_*`-Werte aus `process.env`, normalisiert `baseUrl`
      (kein abschliessender Slash)
    - Wirft `ConfigError`, wenn eine Variable fehlt oder leer ist – **ohne** den
      Wert in die Meldung aufzunehmen
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 `buildPageTitle(kw, jahr)` implementieren
    - Liefert exakt `` `Arbeitsjournal – KW ${kw} / ${jahr}` ``
    - _Requirements: 3.1_

  - [ ]* 2.3 Property-Test für `buildPageTitle`
    - **Property 1: Page_Title-Format**
    - **Validates: Requirements 3.1**
    - Mind. 100 Iterationen; Tag-Kommentar
      `Feature: confluence-upload, Property 1 – Page_Title-Format`

  - [x] 2.4 `convertToStorageFormat(journalText)` implementieren
    - Hilfsfunktionen `escapeXml` (`&` zuerst, dann `<`, `>`) und `applyBold`
      (`**...**` → `<strong>...</strong>`, zeilenweise paarweise)
    - Zeilenweise: nichtleere Zeile → `<p>…</p>`, leere Zeile → `<p />`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.5 Property-Test: Ausgabe ist wohlgeformtes XHTML
    - **Property 3: Ausgabe ist wohlgeformtes XHTML**
    - **Validates: Requirements 5.1**

  - [ ]* 2.6 Property-Test: Fett-Konvertierung der Überschriften
    - **Property 4: Fett-Konvertierung der Überschriften**
    - **Validates: Requirements 5.2**

  - [ ]* 2.7 Property-Test: Sonderzeichen werden korrekt maskiert
    - **Property 5: Sonderzeichen werden korrekt maskiert**
    - **Validates: Requirements 5.4**

  - [ ]* 2.8 Property-Test: Zeilen- und Absatz-Invariante
    - **Property 6: Zeilen- und Absatz-Invariante**
    - **Validates: Requirements 5.3, 5.5**

  - [ ]* 2.9 Unit-Tests für `loadConfig`/`ConfigError`
    - Je eine fehlende/leere Variable → `ConfigError`; Meldung enthält keinen Wert
    - _Requirements: 1.3_

- [ ] 3. Confluence-Client in `lib/confluence.ts`: Suchen, Erstellen, Aktualisieren
  - [x] 3.1 `uploadJournal(input)` implementieren
    - `loadConfig()`, `buildPageTitle`, `convertToStorageFormat` verketten
    - **Suchen:** `GET {baseUrl}/rest/api/content/{rootPageId}/child/page?limit=250`,
      exakter Abgleich per `title`; Treffer liefert `id` und `version.number`
      (bei Bedarf `?expand=version` bzw. `GET …/content/{id}?expand=version`)
    - **Aktualisieren** (Treffer): `PUT {baseUrl}/rest/api/content/{id}` mit
      `{ id, type:"page", title:<bestehend>, version:{ number: n+1 },
      body:{ storage:{ value, representation:"storage" } } }` (kein `ancestors`)
      → `action:"updated"`
    - **Erstellen** (kein Treffer): `POST {baseUrl}/rest/api/content` mit
      `{ type:"page", title, space:{ key:spaceKey }, ancestors:[{ id:rootPageId }],
      body:{ storage:{ value, representation:"storage" } } }` → `action:"created"`
    - Header je Request: `Authorization: Bearer {pat}`,
      `Content-Type: application/json`, `Accept: application/json`
    - Bei HTTP-Fehlerstatus/Netzwerkfehler Fehler werfen – **ohne** Zugangsdaten;
      PAT nie loggen. Optionaler einfacher `fetch`-Timeout (`AbortSignal.timeout`)
      ist erlaubt, aber minimal halten – keine Retry-Bibliothek
    - _Requirements: 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 6.2, 6.3_

  - [ ]* 3.2 Property-Test: Versionsnummer wird um genau 1 erhöht
    - **Property 2: Versionsnummer wird um genau 1 erhöht**
    - **Validates: Requirements 4.3**
    - `fetch` gemockt; für generierte Versionsnummern `n` prüfen, dass der
      PUT-Body `version.number === n + 1` enthält

  - [ ]* 3.3 Integrationstests für den Client (`fetch` gemockt)
    - Erstellen: GET ohne Treffer → POST mit `space.key`,
      `ancestors[0].id === rootPageId`, `body.storage.value` == konvertierter Text,
      `representation === "storage"`; `action === "created"`
    - Aktualisieren: GET mit Treffer → PUT mit `version.number === n+1`,
      beibehaltenem Titel, ohne `ancestors`; `action === "updated"`
    - Auth/Sicherheit: Requests tragen `Authorization: Bearer …`, PAT erscheint in
      keiner Response; API-Fehler (4xx/5xx) → geworfener Fehler ohne Zugangsdaten
    - _Requirements: 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 6.2, 6.3, 7.1_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Route Handler `app/api/confluence/route.ts`
  - [x] 5.1 `POST`-Handler implementieren (Vorbild: `app/api/generate/route.ts`)
    - `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`
    - Body parsen; bei ungültigem JSON HTTP 400
    - Pflichtangaben prüfen (`journalText` nichtleerer String, `kw`/`jahr` Zahlen)
      → sonst HTTP 400
    - `uploadJournal(body)` aufrufen; Erfolg → `Response.json({ action }, { status: 200 })`
    - Fehler: `ConfigError` → 500, sonstige → 502; immer generische Meldung,
      keine Zugangsdaten/Details, kein Logging von Request-/Konfigurationsinhalten
    - Liest selbst **keine** `CONFLUENCE_*`-Werte (geschieht nur in `lib/confluence.ts`)
    - _Requirements: 6.1, 6.4, 6.5, 1.3, 6.3, 7.1_

  - [ ]* 5.2 Unit-Tests für die Body-Validierung
    - Fehlender/leerer `journalText`, fehlende `kw`/`jahr` → HTTP 400
    - _Requirements: 6.4_

- [ ] 6. UI-Anbindung in `components/JournalPreview.tsx` (Verdrahtung mit dem Endpoint)
  - [x] 6.1 Upload-Button, Status, Fehler- und Erfolgsanzeige ergänzen
    - Lokaler `UploadStatus`-State (`idle | loading | success(action) | error`)
    - Dritter Button „Nach Confluence hochladen“ im Sekundär-Stil (weiss, roter
      Rand) – gleiche Klassen wie „Kopieren“/„Download .txt“
    - Leer-Prüfung: kein Tagesabsatz und keine Reflexion → Upload nicht starten,
      Button deaktiviert, Hinweis „zuerst Inhalte erfassen“
    - Klick → `loading`, `fetch("/api/confluence", { method:"POST",
      headers:{ "Content-Type":"application/json" }, body: JSON.stringify({
      journalText: text, kw: week.kw, jahr: week.jahr }) })`; Button während des
      Laufs deaktiviert + Statushinweis
    - Erfolg (`res.ok`): `{ action }` lesen → „Seite erstellt.“ / „Seite aktualisiert.“
    - Fehler (`!res.ok` oder Netzwerkfehler): rotes Banner
      „Upload fehlgeschlagen. Bitte versuche es erneut.“ (Stil wie `page.tsx`:
      `border-sbb-red bg-sbb-red/5 text-sbb-red`), Zustand zurückgesetzt
    - Gesamte upload-bezogene UI auf Deutsch
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

- [x] 7. Final-Checkpoint und Verifikation
  - `npm run lint` und `npx tsc --noEmit` ohne Fehler; bei Bedarf `npm run build`
  - Manueller Durchlauf: Woche mit Inhalt → „Nach Confluence hochladen“ →
    „erstellt“; erneuter Upload derselben KW → „aktualisiert“; Fehlerfall (z. B.
    falsche Konfiguration) → rotes Banner. UI-Verhalten (Button-Stil, Deaktivierung,
    Leer-Hinweis) manuell prüfen.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Mit `*` markierte Sub-Tasks sind optional (Tests) und können für ein schnelles
  MVP übersprungen werden; Kern-Implementierungs-Tasks nie überspringen.
- Property-Tests laufen mit mind. 100 Iterationen und tragen den Tag-Kommentar
  `Feature: confluence-upload, Property <Nummer> – <Property-Text>`.
- Keine neuen Laufzeit-Dependencies; nur eingebautes `fetch`. Optionales
  Test-Setup ist rein dev-seitig und nur für die `*`-Aufgaben nötig.
- Keine Retry-Bibliothek (Einfachheit zuerst); höchstens ein einfacher
  `fetch`-Timeout via `AbortSignal.timeout`.
- Die Space-Key-Rekonziliation des Python-Skripts (`?expand=space` auf der
  Wurzelseite) ist bewusst **nicht** im Scope – `CONFLUENCE_SPACE_KEY` kommt direkt
  aus `process.env`.
- Jeder Task referenziert die abgedeckten Requirements zur Nachvollziehbarkeit.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.9"] },
    { "id": 3, "tasks": ["2.4", "2.3"] },
    { "id": 4, "tasks": ["3.1", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 5, "tasks": ["5.1", "3.2", "3.3"] },
    { "id": 6, "tasks": ["6.1", "5.2"] }
  ]
}
```
