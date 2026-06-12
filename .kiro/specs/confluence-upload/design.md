# Design – Confluence-Upload

## Overview

Dieses Feature erweitert den Wochenjournal-Generator um einen **Upload des
fertigen Wochenjournals nach Confluence**. Pro Kalenderwoche entsteht genau eine
Confluence-Seite unterhalb einer konfigurierten Wurzelseite; ein erneuter Upload
derselben KW aktualisiert die vorhandene Seite, statt eine Kopie anzulegen.

Die Confluence-Anbindung wird **vollständig in TypeScript** umgesetzt: ein neuer
serverseitiger Route Handler `POST /api/confluence` nimmt den Upload-Auftrag
entgegen und ruft ein neues `lib`-Modul (`lib/confluence.ts`) auf, das per
`fetch` direkt mit der **Confluence-REST-API** spricht. Das bestehende
Python-Werkzeug wird **nicht** aufgerufen. Es kommen **keine neuen
npm-Dependencies** hinzu – ausschliesslich das eingebaute `fetch`.

Der Upload-Endpoint folgt exakt den Konventionen des bestehenden Endpoints
`app/api/generate/route.ts`: Web-`Request`/`Response`, `runtime = "nodejs"`,
`dynamic = "force-dynamic"`. Die Confluence-Zugangsdaten liegen ausschliesslich
serverseitig in `process.env` (kein `NEXT_PUBLIC_`-Präfix) und werden nie an den
Client ausgeliefert oder geloggt.

```
Browser (Client Components)              Server (Route Handler)         Confluence
──────────────────────────              ──────────────────────         ──────────
JournalPreview                          app/api/confluence/route.ts
  │  composeJournal(week)                 │  validiert Body
  │  Button "Nach Confluence              │  liest process.env (PAT etc.)
  │  hochladen"                           │  ruft lib/confluence.ts
  │                                       │     │
  └─POST /api/confluence ────────────────►│     ├─ GET  content?title=…  (suchen)
     { journalText, kw, jahr }            │     ├─ POST content          (erstellen)
                                          │     └─ PUT  content/{id}      (aktualisieren)
  ◄── 200 { action: "created"|"updated" } │  ◄── Confluence-REST-API (Bearer PAT)
  ◄── 4xx/5xx { error: "…" }              │
```

### Stack-Einordnung

| Bereich       | Technologie                                                |
|---------------|------------------------------------------------------------|
| Framework     | Next.js **16.2.9** (App Router), Route Handler             |
| Sprache       | TypeScript **5** (strict)                                  |
| HTTP-Client   | eingebautes `fetch` (keine neue Dependency)                |
| API           | Confluence-REST-API (`/rest/api/content`)                  |
| Auth          | Personal Access Token (PAT) als `Authorization: Bearer …`  |
| Sicherheit    | Zugangsdaten nur serverseitig in `process.env`             |

> **Auth-Entscheidung:** SBB betreibt Confluence sehr wahrscheinlich als
> **Data Center / Server** (nicht Cloud). Dort werden Personal Access Tokens als
> **Bearer-Token** im `Authorization`-Header übergeben
> (`Authorization: Bearer {CONFLUENCE_PAT}`). Der ebenfalls konfigurierte
> `CONFLUENCE_USERNAME` dient der Dokumentation/Nachvollziehbarkeit und einem
> möglichen Fallback auf Basic-Auth (`Basic base64(username:PAT)`), falls die
> Instanz das verlangt. Standardweg ist Bearer; ein Wechsel auf Basic wäre eine
> Ein-Zeilen-Änderung im `lib`-Modul.

---

## Architecture

### Projektstruktur (neue/geänderte Dateien)

```
app/
  api/
    confluence/route.ts   ← NEU: POST-Endpoint, Node-Runtime, force-dynamic
    generate/route.ts     ← unverändert (Vorbild für Struktur)
components/
  JournalPreview.tsx      ← GEÄNDERT: Upload-Button + Status/Fehler/Erfolg
lib/
  confluence.ts           ← NEU: Confluence_Client + Storage_Converter
  journal.ts              ← unverändert (liefert composeJournal)
types/
  journal.ts              ← GEÄNDERT: Confluence-Request/-Response-Typen
.env.example              ← GEÄNDERT: fünf CONFLUENCE_*-Variablen dokumentiert
```

### Zuständigkeiten

- **`lib/confluence.ts`** (serverseitige Geschäftslogik):
  - `convertToStorageFormat(journalText)` – der **Storage_Converter** (reine
    Funktion, journaltext → Confluence-XHTML-Storage_Format).
  - `buildPageTitle(kw, jahr)` – bildet den Page_Title.
  - `uploadJournal(input)` – orchestriert Suchen/Erstellen/Aktualisieren
    (**Confluence_Client**) und liest die Konfiguration aus `process.env`.
- **`app/api/confluence/route.ts`** (Transport/Validierung): nimmt den Request
  entgegen, validiert den Body, ruft `uploadJournal`, mappt Erfolg/Fehler auf
  HTTP-Status und generische Meldungen. Kennt keine Confluence-Details.
- **`components/JournalPreview.tsx`** (UI): Button, Lade-/Status-Anzeige, rotes
  Fehlerbanner, Erfolgsmeldung (erstellt vs. aktualisiert).

Diese Aufteilung spiegelt das Vorbild `route.ts` ↔ `lib/ai.ts`: der Route
Handler ist dünn und transportorientiert, die Logik lebt in `lib/`.

---

## Components and Interfaces

### `lib/confluence.ts`

#### Konfiguration

```ts
interface ConfluenceConfig {
  username: string;
  pat: string;
  baseUrl: string;     // ohne abschliessenden Slash normalisiert
  spaceKey: string;
  rootPageId: string;
}

// Liest und validiert alle fünf Variablen aus process.env.
// Wirft einen ConfigError, wenn eine fehlt oder leer ist (Werte nie in der
// Fehlermeldung). Wird ausschliesslich serverseitig aufgerufen.
function loadConfig(): ConfluenceConfig
```

#### Storage_Converter

```ts
// Wandelt den von composeJournal() erzeugten Journaltext in gültiges
// Confluence-Storage_Format (XHTML) um.
export function convertToStorageFormat(journalText: string): string
```

Regeln (Requirement 5):

1. **Escaping zuerst:** In jeder Zeile werden `&`, `<`, `>` zu `&amp;`, `&lt;`,
   `&gt;` maskiert. `&` wird zwingend **zuerst** ersetzt, damit bereits erzeugte
   Entities nicht doppelt maskiert werden.
2. **Fett-Überschriften:** Nach dem Escaping werden mit `**...**` markierte
   Stellen in `<strong>...</strong>` umgewandelt (z. B.
   `**Arbeitsjournal – KW 12 / 2025**` → `<strong>Arbeitsjournal – KW 12 / 2025</strong>`).
   Da der Journaltext die `**`-Marker zeilenweise paarweise enthält, wird pro
   Zeile gematcht.
3. **Zeilen erhalten:** Der Text wird an `\n` in Zeilen zerlegt. Jede
   **nichtleere** Zeile wird zu einem Absatz `<p>…</p>`; so geht keine
   Inhaltszeile verloren.
4. **Absatztrennung bei Leerzeilen:** Eine **leere** Zeile (nach `trim` leer)
   wird als Trenner behandelt und als `<p />` (leerer Absatz) ausgegeben, sodass
   die im Journaltext durch Leerzeilen erzeugte Absatztrennung im
   Storage_Format sichtbar erhalten bleibt.

Skizze:

```ts
export function convertToStorageFormat(journalText: string): string {
  return journalText
    .split("\n")
    .map((line) => {
      const escaped = escapeXml(line);            // & < >  (in dieser Reihenfolge)
      if (escaped.trim() === "") return "<p />";  // Leerzeile → Absatztrenner
      const withBold = applyBold(escaped);        // **x** → <strong>x</strong>
      return `<p>${withBold}</p>`;
    })
    .join("");
}
```

#### Confluence_Client

```ts
export type UploadAction = "created" | "updated";

interface UploadInput {
  journalText: string;
  kw: number;
  jahr: number;
}

interface UploadResult {
  action: UploadAction;
  pageId: string;
}

// Orchestriert den gesamten Upload. Liest Config aus process.env.
export async function uploadJournal(input: UploadInput): Promise<UploadResult>
```

Ablauf von `uploadJournal`:

1. `config = loadConfig()`.
2. `title = buildPageTitle(kw, jahr)` →
   `` `Arbeitsjournal – KW ${kw} / ${jahr}` `` (Requirement 3.1).
3. `storage = convertToStorageFormat(journalText)`.
4. **Suchen** (Requirement 4.1): `GET {baseUrl}/rest/api/content` mit Query
   `spaceKey={spaceKey}&title={title}&expand=version` (URL-kodiert).
   - Treffer → bestehende Seite: `{ id, version.number }`.
5. **Aktualisieren** (vorhanden) (Requirement 4.2–4.4):
   `PUT {baseUrl}/rest/api/content/{id}` mit Body
   ```jsonc
   {
     "id": "<id>",
     "type": "page",
     "title": "<unveränderter vorhandener Titel>",
     "version": { "number": <vorherige Version + 1> },
     "body": { "storage": { "value": "<storage>", "representation": "storage" } }
   }
   ```
   Kein `ancestors`-Feld → Elternseite bleibt unverändert. → `action: "updated"`.
6. **Erstellen** (nicht vorhanden) (Requirement 3.2–3.4):
   `POST {baseUrl}/rest/api/content` mit Body
   ```jsonc
   {
     "type": "page",
     "title": "<title>",
     "space": { "key": "<spaceKey>" },
     "ancestors": [{ "id": "<rootPageId>" }],
     "body": { "storage": { "value": "<storage>", "representation": "storage" } }
   }
   ```
   → `action: "created"`.

Alle Requests setzen die Header
`Authorization: Bearer {pat}`, `Content-Type: application/json`,
`Accept: application/json`. Bei HTTP-Fehlerstatus oder Netzwerkfehler wirft die
Funktion einen Fehler **ohne Zugangsdaten** (siehe Fehlerbehandlung).

```ts
export function buildPageTitle(kw: number, jahr: number): string {
  return `Arbeitsjournal – KW ${kw} / ${jahr}`;
}
```

### `app/api/confluence/route.ts`

Mirror von `app/api/generate/route.ts`:

```ts
import { uploadJournal } from "@/lib/confluence";
import type { ConfluenceUploadRequest } from "@/types/journal";

export const runtime = "nodejs";          // serverseitig, fetch + process.env
export const dynamic = "force-dynamic";   // nie cachen

export async function POST(request: Request): Promise<Response> {
  let body: ConfluenceUploadRequest;
  try {
    body = (await request.json()) as ConfluenceUploadRequest;
  } catch {
    return new Response("Ungültiger Request-Body.", { status: 400 });
  }

  // Pflichtangaben prüfen (Requirement 6.4)
  if (
    typeof body.journalText !== "string" ||
    body.journalText.trim() === "" ||
    typeof body.kw !== "number" ||
    typeof body.jahr !== "number"
  ) {
    return new Response("Pflichtangaben fehlen.", { status: 400 });
  }

  try {
    const result = await uploadJournal(body);
    return Response.json({ action: result.action }, { status: 200 });
  } catch (err) {
    // ConfigError (fehlende Variable) → 500; sonst je nach Ursache.
    // Keine Details/Zugangsdaten an den Client. (Requirement 1.3, 6.3, 7.1)
    const status = err instanceof ConfigError ? 500 : 502;
    return new Response("Upload nach Confluence fehlgeschlagen.", { status });
  }
}
```

- Liest selbst **keine** `process.env`-Werte für Confluence; das geschieht in
  `lib/confluence.ts`. Der Handler kennt PAT etc. nicht.
- Loggt im Fehlerfall keine Request-/Konfigurationsinhalte.

### `components/JournalPreview.tsx` (Änderung)

Der bestehende Vorschau-Block wird um einen dritten Button und einen
Status-Bereich ergänzt. Lokaler State (die Komponente erhält bereits `week`):

```ts
type UploadStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; action: "created" | "updated" }
  | { kind: "error" };

const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
```

- **Button** „Nach Confluence hochladen“ im Sekundär-Stil (weiss, roter Rand) –
  identische Klassen wie „Kopieren“/„Download .txt“ (Requirement 8.3).
- `text = composeJournal(week)` (bereits vorhanden). **Leer-Prüfung**
  (Requirement 2.4): hat die Woche keinen Tagesabsatz und keine Reflexion
  (`!week.days.some(d => d.text.trim()) && !week.reflexion.trim()`), wird der
  Upload nicht gestartet, sondern ein Hinweis angezeigt; der Button ist in
  diesem Fall deaktiviert.
- **Klick** → `status = { kind: "loading" }`, dann
  `fetch("/api/confluence", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ journalText: text, kw: week.kw, jahr: week.jahr }) })`
  (Requirement 2.2).
- Während des Laufs ist der Button deaktiviert (Requirement 2.3) und es erscheint
  ein Lade-/Statushinweis im Button-Bereich (Requirement 8.1).
- **Erfolg** (`res.ok`): Antwort `{ action }` lesen →
  `status = { kind:"success", action }`; Erfolgsmeldung „Seite erstellt.“ bzw.
  „Seite aktualisiert.“ (Requirement 7.4, 8.2).
- **Fehler** (`!res.ok` oder Netzwerkfehler): `status = { kind:"error" }` →
  rotes Banner „Upload fehlgeschlagen. Bitte versuche es erneut.“; Zustand wird
  zurückgesetzt, erneuter Versuch möglich (Requirement 7.2, 7.3).
- Die gesamte upload-bezogene UI ist auf Deutsch (Requirement 8.2).

Das Fehlerbanner nutzt denselben Stil wie das bestehende Banner in `page.tsx`
(`border-sbb-red bg-sbb-red/5 text-sbb-red`).

---

## Data Models

`types/journal.ts` bleibt die einzige Quelle der Wahrheit. Ergänzt werden die
Request-/Response-Typen für den Upload:

```ts
/** Request an POST /api/confluence. */
export interface ConfluenceUploadRequest {
  /** Fertig zusammengesetzter Journaltext (composeJournal-Ausgabe). */
  journalText: string;
  kw: number;
  jahr: number;
}

/** Erfolgs-Antwort von POST /api/confluence. */
export interface ConfluenceUploadResponse {
  /** Kennzeichnet, ob die Seite neu erstellt oder aktualisiert wurde. */
  action: "created" | "updated";
}
```

Interne Typen des Confluence-Clients (`ConfluenceConfig`, `UploadInput`,
`UploadResult`, `UploadAction`) bleiben in `lib/confluence.ts` lokal, da sie
nicht zwischen Client und Server geteilt werden.

---

## Correctness Properties

*Eine Property ist eine Eigenschaft oder ein Verhalten, das über alle gültigen
Ausführungen eines Systems hinweg gelten soll – im Kern eine formale Aussage
darüber, was das System tun muss. Properties bilden die Brücke zwischen
menschenlesbarer Spezifikation und maschinell überprüfbaren
Korrektheitsgarantien.*

Eigenschaftsbasiertes Testen (PBT) ist hier gezielt auf die **reine Logik**
anwendbar: den **Storage_Converter** (`convertToStorageFormat`), die Titelbildung
(`buildPageTitle`) und die Versionsberechnung beim Update. Die Confluence-REST-
Aufrufe selbst (HTTP-I/O gegen einen externen Dienst) sowie die UI werden
**nicht** per PBT getestet, sondern über Beispiel-/Integrationstests (siehe
Teststrategie).

> **Hinweis zum Stack:** Aktuell ist **kein Test-Framework** installiert (siehe
> bestehende Spec `wochenjournal-generator`). Werden die folgenden Properties
> umgesetzt, ist eine PBT-Bibliothek für TypeScript zu verwenden (z. B.
> `fast-check`) und **nicht** von Hand zu implementieren. Jeder Property-Test
> läuft mit mindestens **100 Iterationen** und trägt einen Tag-Kommentar im
> Format `Feature: confluence-upload, Property <Nummer> – <Property-Text>`.

### Property 1: Page_Title-Format

*Für jede* Kalenderwoche `kw` und jedes Jahr `jahr` ergibt `buildPageTitle(kw, jahr)`
exakt die Zeichenkette `Arbeitsjournal – KW {kw} / {jahr}`, sodass KW und Jahr
unverändert und im vorgegebenen Format enthalten sind.

**Validates: Requirements 3.1**

### Property 2: Versionsnummer wird um genau 1 erhöht

*Für jede* vorhandene Versionsnummer `n` einer bestehenden Seite enthält der beim
Aktualisieren erzeugte Update-Body `version.number == n + 1`.

**Validates: Requirements 4.3**

### Property 3: Ausgabe ist wohlgeformtes XHTML

*Für jeden* Journaltext ist die Ausgabe von `convertToStorageFormat` wohlgeformtes
XML/XHTML (parsebar, ausbalancierte Tags) und damit gültiges Confluence-
Storage_Format.

**Validates: Requirements 5.1**

### Property 4: Fett-Konvertierung der Überschriften

*Für jeden* Journaltext, der paarweise mit `**...**` markierte Stellen enthält,
erscheint im Output jede solche Markierung als `<strong>...</strong>`, und es
verbleiben keine literalen `**`-Marker im Output.

**Validates: Requirements 5.2**

### Property 5: Sonderzeichen werden korrekt maskiert

*Für jeden* Journaltext enthält der Textinhalt der Ausgabe keine rohen `<`- oder
`>`-Zeichen, und jedes `&` des Eingabetexts wird zu genau `&amp;` maskiert (keine
Doppelmaskierung wie `&amp;amp;`).

**Validates: Requirements 5.4**

### Property 6: Zeilen- und Absatz-Invariante

*Für jeden* Journaltext mit `N` durch `\n` getrennten Zeilen erzeugt
`convertToStorageFormat` genau `N` Absatz-Elemente in derselben Reihenfolge,
wobei jede nichtleere Zeile zu einem `<p>…</p>` und jede Leerzeile zu einem
leeren Absatz (`<p />`) wird – so geht keine Inhaltszeile verloren und die
Absatztrennung durch Leerzeilen bleibt erhalten.

**Validates: Requirements 5.3, 5.5**

---

## Error Handling

| Fall                                         | Schicht        | Verhalten                                                                 |
|----------------------------------------------|----------------|---------------------------------------------------------------------------|
| Journal leer (kein Tagesabsatz, keine Reflexion) | UI         | Upload startet nicht, Button deaktiviert, Hinweis (Req 2.4)               |
| Pflichtangaben fehlen (journalText/kw/jahr)  | Route Handler  | HTTP 400, generische Meldung (Req 6.4)                                    |
| Confluence-Variable fehlt/leer               | `lib` → Handler| `ConfigError` → HTTP 500, generische Meldung ohne Werte (Req 1.3, 6.3)    |
| Confluence-API liefert 4xx/5xx               | `lib` → Handler| Fehler werfen → HTTP 502, generische Meldung ohne Zugangsdaten (Req 7.1)  |
| Confluence nicht erreichbar (Netzwerk)       | `lib` → Handler| Fehler werfen → HTTP 502, generische Meldung (Req 7.1)                    |
| Upload-Fehler (beliebig)                     | UI             | Rotes Banner „Bitte erneut versuchen“, Zustand zurückgesetzt (Req 7.2/7.3)|
| Upload erfolgreich                           | UI             | Erfolgsmeldung „erstellt“ / „aktualisiert“ (Req 7.4)                       |

Grundsätze:

- **Keine Zugangsdaten in Fehlermeldungen oder Logs.** Der Route Handler gibt
  ausschliesslich generische Texte zurück; der `CONFLUENCE_PAT` wird nie in eine
  Response geschrieben und nie geloggt (Req 6.3).
- **Fehlerklassen:** `ConfigError` (fehlende/leere Konfiguration) → 500;
  Confluence-/Transportfehler → 502. Beide tragen für den Client dieselbe
  generische Meldung.
- Bereits erfasste Journalinhalte im Browser bleiben bei einem Fehler erhalten;
  ein erneuter Versuch ist jederzeit möglich.

---

## Testing Strategy

Es ist derzeit **kein Test-Framework** installiert (konsistent mit der
bestehenden Spec). Die Verifikation erfolgt zweistufig: statisch über
`npm run lint` und `npx tsc --noEmit` (strict) sowie über einen manuellen
Durchlauf entlang der Akzeptanzkriterien. Wird – wie für die Properties oben
empfohlen – ein Test-Setup ergänzt, gilt der folgende duale Ansatz.

### Property-based Tests (reine Logik)

Anwendbar auf `lib/confluence.ts` (Storage_Converter, `buildPageTitle`,
Versionsberechnung). Bibliothek: eine etablierte TypeScript-PBT-Bibliothek
(z. B. `fast-check`), **nicht** selbst implementiert.

- Mindestens **100 Iterationen** pro Property.
- Tag-Format je Test: `Feature: confluence-upload, Property <Nummer> – <Property-Text>`.
- Genau **ein** Property-Test pro Korrektheits-Property (Properties 1–6).
- Generatoren decken Edge-Cases ab: leere Strings, reine Whitespace-Zeilen,
  Texte mit `&`, `<`, `>`, bereits `&amp;`-ähnliche Sequenzen, mehrere
  aufeinanderfolgende Leerzeilen, Zeilen mit mehreren `**...**`-Paaren,
  Nicht-ASCII-Zeichen (Umlaute, „–“).

### Beispiel- und Edge-Case-Tests (eigene Logik, nicht universell)

- **ConfigError** (Req 1.3): je eine fehlende/leere Variable → Fehler, Meldung
  enthält keinen Wert.
- **Body-Validierung** (Req 6.4): fehlender `journalText`/`kw`/`jahr` und leerer
  `journalText` → HTTP 400.
- **Leeres Journal** (Req 2.4): WeekJournal ohne Inhalte → kein Upload, Hinweis.

### Integrationstests (Confluence-Client, gemockt)

`fetch` wird gemockt; 1–3 repräsentative Beispiele je Fall (kein PBT, da
externes-Dienst-Verhalten nicht sinnvoll mit Input variiert):

- **Erstellen** (Req 3.2–3.4, 6.5): GET ohne Treffer → POST `/rest/api/content`
  mit `space.key`, `ancestors[0].id == rootPageId`, `body.storage.value ==`
  konvertierter Text, `representation == "storage"`; Antwort 200, `action == "created"`.
- **Aktualisieren** (Req 4.1–4.4, 6.5): GET mit Treffer (Version `n`) → PUT
  `/rest/api/content/{id}` mit `version.number == n + 1`, beibehaltenem Titel,
  ohne `ancestors`; Antwort 200, `action == "updated"`.
- **Auth/Sicherheit** (Req 6.2/6.3): Requests tragen `Authorization: Bearer …`;
  der PAT erscheint in keiner Response.
- **API-Fehler** (Req 7.1): GET/POST/PUT liefert 4xx/5xx oder wirft → Endpoint
  antwortet mit Fehlerstatus und generischer Meldung ohne Zugangsdaten.

### UI-Tests (Beispiele)

`JournalPreview` (Req 2.1–2.3, 7.2–7.4, 8.1–8.3): Button vorhanden und im
Sekundär-Stil; Klick sendet korrekten Body; Button während Upload deaktiviert mit
Statushinweis; Fehler → rotes Banner und Zustands-Reset; Erfolg → Meldung
„erstellt“/„aktualisiert“; Texte auf Deutsch.

### Smoke-/Setup-Checks

- `app/api/confluence/route.ts` exportiert `runtime = "nodejs"`,
  `dynamic = "force-dynamic"` und `POST` (Req 6.1).
- Confluence-Variablen ohne `NEXT_PUBLIC_`-Präfix; nicht im Client-Bundle
  (Req 1.2, 6.2).
- `.env.example` enthält die fünf `CONFLUENCE_*`-Variablen mit Kommentaren und
  ohne echte Werte (Req 1.4).

### Pflicht-Verifikation nach Implementierung

- `npm run lint` ohne Fehler.
- `npx tsc --noEmit` (strict) ohne Fehler.
- Bei Bedarf `npm run build`.
- Manueller Durchlauf: Woche mit Inhalt → „Nach Confluence hochladen“ →
  Erfolgsmeldung „erstellt“; erneuter Upload derselben KW → „aktualisiert“;
  Fehlerfall (z. B. falsche Konfiguration) → rotes Banner.
