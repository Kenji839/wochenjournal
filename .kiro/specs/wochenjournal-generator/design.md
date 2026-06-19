# Design – Wochenjournal-Generator

## Überblick

Eine clientseitig interaktive Next.js-App (App Router) mit einem serverseitigen
Route Handler für den Claude-API-Aufruf. Der Nutzer baut sein Journal
**inkrementell über die Woche** auf: Pro Wochentag (Mo–Fr) gibt er Stichworte ein
und generiert daraus einen Tagesabsatz. Am Freitag generiert er aus dem
Wocheninhalt die Reflexion (vier Abschnitte). Aus allen Teilen wird ein fertiges
Journal zusammengesetzt, das kopiert oder heruntergeladen werden kann.

Der Zustand (laufende Woche + Verlauf vergangener Wochen) liegt im `localStorage`.
Kein Backend mit Datenbank, kein Login.

```
Browser (Client Components)                 Server (Route Handler)        Anthropic
──────────────────────────                  ──────────────────────        ─────────
WeekSelector ─┐
DayCard (×5) ─┤
ReflectionPanel ├─► page.tsx (State) ─POST /api/generate {mode}─► route.ts ─stream─► Claude
JournalPreview │         │                                          │
HistoryPanel ──┘         │  ◄──────── text/plain ReadableStream ────┘
                         │
                  localStorage (Wochen)
```

### Stack (real installiert)

| Bereich   | Technologie                                          |
|-----------|------------------------------------------------------|
| Framework | Next.js **16.2.9** (App Router)                      |
| Runtime   | React **19**                                         |
| Sprache   | TypeScript (strict)                                  |
| Styling   | Tailwind **v4** (`@import "tailwindcss"` + `@theme`) |
| KI        | Google Gemini API (kostenloser Tier), `gemini-2.5-flash`, Streaming |
| SDK       | `@google/genai` (ersetzt `@anthropic-ai/sdk`)        |
| Storage   | `localStorage`                                       |

> **Abweichung vom Briefing:** Das Briefing nennt Next.js 14 und die Anthropic
> Claude API. Installiert ist Next.js 16; als KI-Anbieter wird Google Gemini
> verwendet (mangels Claude-Guthaben). Route Handler und Streaming folgen den
> Next-16-Konventionen (Web `Request`/`Response`, `ReadableStream`).

> **Model:** Default `gemini-2.5-flash` (kostenloser Tier, gutes Deutsch,
> Streaming). Über `process.env.GEMINI_MODEL` überschreibbar.

### Dependency-Entscheidung

Für das Streaming wird das offizielle `@google/genai` genutzt (typisiert,
async-iterierbarer Chunk-Stream über `generateContentStream`). Der Server
iteriert über die Text-Chunks (`chunk.text`) und gibt sie als **reinen
Text-Stream** (`text/plain`) zurück. Der Client muss kein SSE parsen, sondern
hängt ankommende Chunks nur an das Zielfeld an (Tagesabsatz oder Reflexion).
`@anthropic-ai/sdk` wird entfernt.

---

## Projektstruktur

```
app/
  api/generate/route.ts   ← POST, mode "day" | "reflection", Streaming
  page.tsx                ← Hauptseite, hält den gesamten UI-State
  layout.tsx              ← Root Layout (Metadaten, globals.css)
  globals.css             ← Tailwind v4 + SBB-Theme-Variablen
components/
  WeekSelector.tsx        ← KW/Jahr-Auswahl
  DayCard.tsx             ← ein Wochentag: Stichworte, Generieren, editierbarer Absatz
  ReflectionPanel.tsx     ← Reflexion generieren + editierbar
  JournalPreview.tsx      ← zusammengesetztes Gesamtjournal + Export
  HistoryPanel.tsx        ← Verlauf der gespeicherten Wochen
lib/
  ai.ts                   ← Helper: ruft Gemini an, liefert Text-Stream
  storage.ts              ← localStorage: Wochen lesen/schreiben/löschen
  prompt.ts               ← System-Prompts + buildDayPrompt()/buildReflectionPrompt()
  journal.ts              ← composeJournal(): Woche → fertiger Journaltext
  date.ts                 ← getCurrentWeek() (ISO-Kalenderwoche)
types/
  journal.ts              ← WeekJournal, DayEntry, GenerateRequest, Weekday
.env.local                ← GEMINI_API_KEY=... (nicht versioniert)
.kiro/hooks/              ← validate-prompt-structure, sync-types-on-api-change
```

---

## Datenmodell (`types/journal.ts`)

```ts
export type Weekday =
  | "montag" | "dienstag" | "mittwoch" | "donnerstag" | "freitag";

export interface DayEntry {
  weekday: Weekday;
  stichworte: string;   // rohe Stichwort-Eingabe des Tages
  text: string;         // generierter / editierter Tagesabsatz
}

export interface WeekJournal {
  id: string;                  // crypto.randomUUID()
  kw: number;
  jahr: number;
  days: DayEntry[];            // genau 5 Einträge (Mo–Fr), feste Reihenfolge
  reflexion: string;           // generierter Reflexionsblock (4 Abschnitte)
  updatedAt: string;           // ISO-String der letzten Änderung
}

// Request an /api/generate – per "mode" unterschieden
export type GenerateRequest =
  | {
      mode: "day";
      weekday: Weekday;
      stichworte: string;
    }
  | {
      mode: "reflection";
      kw: number;
      jahr: number;
      days: { weekday: Weekday; text: string }[];
      // Kontext der bis zu 3 direkt vorangegangenen Wochen (älteste zuerst),
      // nur Wochen mit nicht-leerer Reflexion
      previousWeeks: { kw: number; jahr: number; reflexion: string }[];
    };
```

Konstante Reihenfolge der Wochentage zentral, z. B.:

```ts
export const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "montag", label: "Montag" },
  { key: "dienstag", label: "Dienstag" },
  { key: "mittwoch", label: "Mittwoch" },
  { key: "donnerstag", label: "Donnerstag" },
  { key: "freitag", label: "Freitag" },
];
```

---

## Komponenten- und Modul-Design

### `lib/prompt.ts`

Zwei feste System-Prompts plus Builder.

- `SYSTEM_PROMPT_DAY` – Erzeugt aus Tages-Stichworten **einen** sachlichen
  Fliesstext-Absatz (2–4 Sätze). Regeln: Schweizer Hochdeutsch (kein "ß", immer
  "ss"), keine erfundenen Details, kein "Montag:"-Präfix (wird beim Zusammensetzen
  ergänzt), kein Aufzählungszeichen, nur der Absatz als Ausgabe.
- `SYSTEM_PROMPT_REFLECTION` – Erzeugt aus den Tagesabsätzen der Woche **genau
  vier** Abschnitte mit exakt diesen Überschriften und je einer Aufzählung:
  - `**Was ist mir in dieser Woche gut gelungen?**`
  - `**Probleme / Herausforderungen**`
  - `**Was kann ich besser machen in Zukunft?**`
  - `**Was habe ich diese Woche neu gelernt?**`
  Regeln wie oben; reflektierender Ton; nur was aus dem Wocheninhalt
  hervorgeht. WENN Vorwochen-Kontext mitgegeben wird, soll der Prompt anweisen,
  erkennbare Fortschritte gegenüber den Vorwochen zu benennen (insb. in "gut
  gelungen" und "besser machen") – ohne Vorwochen-Details zu erfinden.
- `buildDayPrompt(req)` → `{ system, user }` für `mode: "day"`. `user` enthält den
  Wochentag und die Stichworte.
- `buildReflectionPrompt(req)` → `{ system, user }` für `mode: "reflection"`.
  `user` enthält die nummerierten Tagesabsätze der aktuellen Woche und – sofern
  vorhanden – die Reflexionen der bis zu 3 Vorwochen als klar abgegrenzten
  Kontextblock ("Kontext frühere Wochen, nur zum Ableiten von Fortschritten").

### `lib/ai.ts`

- `streamCompletion(system: string, user: string, maxTokens: number): ReadableStream<Uint8Array>`
- Erstellt den `GoogleGenAI`-Client mit `process.env.GEMINI_API_KEY`.
- Ruft `ai.models.generateContentStream({ model, contents, config })`
  (Default `model` aus `GEMINI_MODEL` = `gemini-2.5-flash`; `system` via
  `config.systemInstruction`; `config.maxOutputTokens` 1024 für Tag, 1500 für
  Reflexion – per Parameter steuerbar).
- Gibt einen `ReadableStream` zurück, der die Text-Chunks (`chunk.text`)
  UTF-8-kodiert enqueued; Fehler → `controller.error`.

### `lib/journal.ts`

- `composeJournal(week: WeekJournal): string` – Setzt das vollständige Journal
  zusammen:

  ```

  **Was habe ich diese Woche gemacht?**
  Montag: {text|–}
  Dienstag: {text|–}
  Mittwoch: {text|–}
  Donnerstag: {text|–}
  Freitag: {text|–}

  {reflexion}
  ```

  Leere Tage erhalten "–" als Platzhalter (Requirement 6.5). Ist die Reflexion
  leer, wird der Reflexionsblock weggelassen oder mit den vier leeren
  Überschriften gezeigt (Entscheidung: leere Überschriften weglassen, bis
  generiert).

### `lib/storage.ts`

- `loadWeeks(): WeekJournal[]` – liest `wochenjournal_weeks`, fängt JSON-/Quota-
  Fehler ab, gibt sonst `[]`.
- `saveWeek(week: WeekJournal): WeekJournal[]` – aktualisiert vorhandene Woche
  (gleiche `id`) oder fügt neu hinzu, setzt `updatedAt`, sortiert nach
  `updatedAt` absteigend, begrenzt auf 10, schreibt zurück.
- `deleteWeek(id: string): WeekJournal[]` – entfernt Woche, schreibt zurück.
- `findWeek(weeks, kw, jahr): WeekJournal | undefined` – sucht aktive Woche.
- `previousWeeks(weeks, kw, jahr, limit = 3): WeekJournal[]` – liefert die bis zu
  3 chronologisch direkt davor liegenden Wochen mit nicht-leerer Reflexion
  (Sortierung nach jahr+kw), älteste zuerst – als Kontext für die Reflexion.
- Alle Funktionen prüfen `typeof window !== "undefined"` (SSR-Sicherheit).

### `lib/date.ts`

- `getCurrentWeek(): { kw: number; jahr: number }` – aktuelle ISO-Kalenderwoche.

### `app/api/generate/route.ts`

```ts
export const runtime = "nodejs";          // SDK braucht Node-Runtime
export const dynamic = "force-dynamic";   // nie cachen

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  const { system, user } =
    body.mode === "day" ? buildDayPrompt(body) : buildReflectionPrompt(body);

  // Validierung je Modus → bei fehlenden Pflichtangaben HTTP 400
  // (Tag: stichworte nicht leer; Reflexion: mind. ein Tagesabsatz vorhanden)

  const stream = streamCompletion(system, user, maxTokens);
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

- Liest `GEMINI_API_KEY` nur serverseitig.
- Fehler → HTTP 500 (Client zeigt Banner).

### `app/page.tsx` (Client Component, `"use client"`)

Zentraler State:

- `week: WeekJournal` – aktive Woche.
- `weeks: WeekJournal[]` – Verlauf (inkl. aktiver Woche).
- `generating: { type: "day"; weekday: Weekday } | { type: "reflection" } | null`
- `error: string | null`

Ablauf `generateDay(weekday)`:
1. Stichworte des Tages leer → nichts tun (Button ist ohnehin deaktiviert).
2. `generating = { type: "day", weekday }`, Fehler zurücksetzen, Zielfeld leeren.
3. `fetch("/api/generate", { method:"POST", body: JSON.stringify({ mode:"day", weekday, stichworte }) })`.
4. `res.body.getReader()` lesen, per `TextDecoder` dekodieren, fortlaufend in
   `week.days[weekday].text` schreiben (State-Update).
5. Nach Abschluss → `generating = null`, `saveWeek(week)` → `weeks` aktualisieren.
6. `!res.ok` oder Netzwerkfehler → `error` setzen, `generating = null`.

Ablauf `generateReflection()`: analog mit `mode:"reflection"`. `days` = die nicht
leeren Tagesabsätze der aktiven Woche, `previousWeeks` = `previousWeeks(weeks, kw,
jahr)` (bis zu 3 Vorwochen mit Reflexion). Schreibt in `week.reflexion`. Wenn kein
Tagesabsatz existiert → Hinweis statt Request (Requirement 3.5).

Bearbeitungen (Tagesabsatz / Reflexion / Stichworte) aktualisieren `week` und
rufen `saveWeek` (auf `onBlur` oder leicht debounced).

`generating !== null` deaktiviert alle Generieren-Buttons und blockt parallele
Requests (Requirement 9.2).

### `components/WeekSelector.tsx`

- Props: `kw`, `jahr`, `onChange`.
- KW als `<input type="number" min=1 max=53>`, Jahr als Zahl-Input.
- Beim Ändern lädt `page.tsx` die passende Woche oder legt eine neue an.

### `components/DayCard.tsx`

- Props: `day`, `label`, `generating`, `onStichworteChange`, `onTextChange`,
  `onGenerate`.
- Stichwort-Textarea + Button "Tag generieren" (deaktiviert wenn Stichworte leer
  oder `generating`).
- Generierter Absatz: während Streaming nur-lesend mit blinkendem Cursor; danach
  editierbare Textarea (kontrolliert über `onTextChange`).

### `components/ReflectionPanel.tsx`

- Props: `reflexion`, `generating`, `canGenerate`, `hasPreviousContext`,
  `onTextChange`, `onGenerate`.
- Button "Reflexion generieren".
- `canGenerate` ist false, wenn kein Tagesabsatz vorhanden → Hinweis anzeigen.
- `hasPreviousContext` zeigt dezent an, dass Vorwochen als Kontext einfliessen
  (z. B. "Berücksichtigt die letzten N Wochen").
- Reflexionstext: Streaming-Anzeige, danach editierbar.

### `components/JournalPreview.tsx`

- Props: `week` (für `composeJournal`).
- Zeigt das zusammengesetzte Gesamtjournal (read-only Vorschau; bearbeitet wird
  in den Tages-/Reflexionsfeldern).
- Export-Buttons:
  - "Kopieren" → `navigator.clipboard.writeText(composeJournal(week))`,
    2 s "✓ Kopiert!" (lokaler State + `setTimeout`).
  - "Download .txt" → Blob + temporärer `<a download>`, Dateiname
    `arbeitsjournal-kw{kw}-{jahr}.txt`.

### `components/HistoryPanel.tsx`

- Props: `weeks`, `activeId`, `onSelect`, `onDelete`.
- Liste: Titel "KW {kw} / {jahr}" + `updatedAt` via `toLocaleString("de-CH")`.
- Klick → `onSelect(week)` (lädt als aktive Woche). Lösch-Icon → `onDelete(id)`.
- Leerer Verlauf → dezenter Hinweis.

---

## Styling (Tailwind v4)

SBB-Farben als Theme-Tokens in `globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-sbb-red: #EB0000;
  --color-sbb-red-hover: #C50000;
  --color-page: #F8F8F8;
  --color-panel: #FFFFFF;
  --color-ink: #222222;
  --color-line: #E0E0E0;
}
```

- Panels: `bg-panel rounded-lg shadow-sm border border-line`.
- Primärbutton: `bg-sbb-red text-white hover:bg-sbb-red-hover`.
- Sekundärbutton: `bg-white text-sbb-red border border-sbb-red`.
- Ghost: `text-sbb-red hover:underline bg-transparent`.
- Layout Desktop: `lg:grid lg:grid-cols-[2fr_3fr]` (40% / 60%) – links
  WeekSelector + HistoryPanel, rechts DayCards + ReflectionPanel + Preview.
- Mobile: einspaltiger Flow Header → Wochenauswahl → Tage → Reflexion → Vorschau
  → Verlauf.
- Das bestehende Dark-Mode-Snippet in `globals.css` wird entfernt (festes helles
  SBB-Schema).

---

## Streaming-Mechanik (Detail)

1. Server: `generateContentStream(...)` → `chunk.text` wird als
   `encoder.encode(text)` enqueued.
2. Antwort: `text/plain; charset=utf-8`, kein SSE.
3. Client: Reader-Loop, `decoder.decode(value, { stream: true })`, anhängen an
   das Zielfeld (Tagesabsatz oder Reflexion).
4. Fehler: Loop in `try/catch`; bei Fehler `error` setzen, `generating = null`,
   bereits empfangener Teiltext bleibt sichtbar.

---

## Fehlerbehandlung

| Fall                            | Verhalten                                            |
|---------------------------------|------------------------------------------------------|
| Tages-Stichworte leer           | Button deaktiviert, kein Request                     |
| Reflexion ohne Tagesabsätze     | Hinweis, kein Request                                |
| Pflichtangaben fehlen (Server)  | HTTP 400                                              |
| API-/Netzwerkfehler             | rotes Banner, `generating=null`, Buttons wieder aktiv|
| Stream bricht ab                | Banner, empfangener Teiltext bleibt erhalten         |
| localStorage nicht verfügbar    | Storage-Funktionen failen still, App bleibt nutzbar  |

---

## Kiro Hooks

Beide Hooks als `askAgent` auf `fileEdited` (inhaltliche Prüfung nötig).

1. **validate-prompt-structure** – Trigger `fileEdited` auf `lib/prompt.ts`.
   Prüft, ob `SYSTEM_PROMPT_DAY` und `SYSTEM_PROMPT_REFLECTION` ihre
   Pflichtbestandteile enthalten (die vier Reflexions-Überschriften, Regeln zu
   Schweizer Hochdeutsch / keine erfundenen Details). Warnt bei Fehlendem.
2. **sync-types-on-api-change** – Trigger `fileEdited` auf `lib/ai.ts` und
   `app/api/generate/route.ts`. Prüft, ob `types/journal.ts` (insb.
   `GenerateRequest`) noch zur API passt, und gibt sonst einen Hinweis.

---

## Sicherheits-Hinweise

- `GEMINI_API_KEY` nur im Route Handler (`process.env`), nie `NEXT_PUBLIC_`,
  nie im Client-Bundle, nie ins Log.
- `.env.local` über bestehende `.gitignore` ausgeschlossen.
- Keine Authentifizierung. Für ein rein lokales, persönliches Tool akzeptabel.
  **Hinweis:** Bei öffentlichem Deployment ist `/api/generate` ungeschützt und
  kann fremde API-Nutzung/Kosten verursachen – dann einfachen Zugriffsschutz
  ergänzen.

---

## Teststrategie

Kein Test-Framework installiert, Briefing verlangt keines. Verifikation manuell
entlang der Akzeptanzkriterien plus:

- `npm run lint` ohne Fehler.
- `npx tsc --noEmit` (strict) ohne Fehler.
- `npm run build` erfolgreich.
- Manueller Durchlauf: Woche wählen → mehrere Tage generieren/bearbeiten →
  Reflexion generieren → Vorschau prüfen → Kopieren/Download → Verlauf → Reload.
