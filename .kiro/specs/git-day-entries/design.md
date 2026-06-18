# Design – Git-Tagesstichworte (git-day-entries)

## Overview

Dieses Feature ergänzt den Wochenjournal-Generator um eine Möglichkeit, die
Commit-Titel einer Kalenderwoche aus einem lokalen Git-Repository als
Tagesstichworte zu übernehmen. Es besteht aus drei Bausteinen:

1. **Git_Reader** (`lib/git.ts`) – reine serverseitige Logik, die in einem
   lokalen Repository `git log` ausführt, die Ausgabe parst, nach
   Konfiguriertem_Author und Merge-Commits filtert und die Commit-Titel den
   Wochentagen Montag–Freitag der angefragten ISO-Kalenderwoche zuordnet.
2. **Git_Summary_API** (`app/api/git-summary/route.ts`) – ein `GET`-Route-Handler,
   der Query-Parameter (`repoPath`, `week`, `year`) validiert, den Git_Reader
   aufruft und das Ergebnis als JSON zurückgibt. Fehlertolerant: bei jedem
   Problem eine Leere_Antwort mit HTTP 200.
3. **Frontend-Integration** (`components/DayCard.tsx` + `app/page.tsx`) – ein
   zusätzlicher Button "Aus Git laden" je Wochentag, der die Commit-Titel des
   betreffenden Tages in das Stichwort-Feld **anfügt** (ohne vorhandenen Inhalt
   zu überschreiben).

Das Feature ist bewusst für den **rein lokalen Betrieb** gedacht. Der zentrale
Sicherheitsaspekt: Ein vom Client gelieferter Repository-Pfad wird an einen
Git-Aufruf weitergereicht. Das Design verhindert Command-Injection (kein Shell,
Werte als separate Argumente via `execFileSync`) und macht Path-Traversal
folgenlos (der Pfad dient nur als Arbeitsverzeichnis eines `git`-Prozesses; es
werden keine beliebigen Dateien gelesen).

> **Hinweis zur Steering-Realität:** `tech.md` schreibt "kein Test-Framework".
> Tatsächlich sind **Vitest 4** (`npm test` → `vitest run`) und **fast-check 4**
> als devDependencies installiert und werden in `lib/*.test.ts` bereits genutzt.
> Dieses Design stützt sich deshalb auf Property-Based-Tests mit fast-check. Die
> Teststrategie weist die Diskrepanz aus.

---

## Architecture

```
Browser (Client Components)                Server (Route Handler)        Dateisystem
──────────────────────────                 ──────────────────────        ───────────
DayCard (×5)                                                             lokales Git-Repo
  └─ "Aus Git laden" ─┐                                                  (Arbeitsverzeichnis)
                      │                                                        ▲
        page.tsx (State) ─GET /api/git-summary?week&year&repoPath─► route.ts   │
                      │                                              │  validiert │
                      │                                              ▼            │
                      │                                          lib/git.ts ──execFileSync("git", …)
                      │  ◄──────── JSON { week, year, days } ──────────┘   cwd = repoPath
                      │
              setStichworte() (anfügen)
```

Datenfluss eines Ladevorgangs:

1. Nutzer klickt in einer `DayCard` auf "Aus Git laden".
2. `page.tsx` sendet `GET /api/git-summary?week={kw}&year={jahr}` (optional
   `&repoPath=…`); der Repository_Pfad kommt sonst aus `GIT_REPO_PATH` bzw. dem
   Default.
3. Der Route Handler validiert `week`/`year`, löst den Repository_Pfad auf und
   ruft `readGitSummary()` auf.
4. `lib/git.ts` berechnet die fünf Tagesdaten der ISO-Woche **serverseitig**,
   führt `git log` aus, parst, filtert und gruppiert.
5. Die Antwort `{ week, year, days }` geht an den Client; dieser fügt die Liste
   des betreffenden Tages an das bestehende Stichwort-Feld an.

### Technische Konventionen (Next.js 16)

- `app/api/git-summary/route.ts` exportiert eine benannte `GET`-Funktion mit
  Web-`Request`/`Response`.
- `export const runtime = "nodejs"` – `node:child_process` braucht Node-Runtime
  (nicht Edge).
- `export const dynamic = "force-dynamic"` – nie cachen (Git-Stand ändert sich).
- Query-Parameter werden über `new URL(request.url).searchParams` gelesen
  (kein `NextRequest` nötig).
- Antwort als `Response.json({ … })`.

### Sicherheits-Architektur

| Risiko | Massnahme |
|--------|-----------|
| Command-Injection | `execFileSync("git", [args], { cwd })` – **kein** `exec`/Shell, keine String-Interpolation; alle variablen Werte als separate Array-Argumente. |
| Path-Traversal | Der Pfad dient nur als `cwd` eines `git`-Prozesses; es wird nie eine vom Client bestimmte Datei gelesen. Zusätzlich: Pfad mit Shell-Metazeichen (`;`, `|`, `&`, `$`, Backtick, `"`, `'`) wird abgewiesen → Leere_Antwort. |
| Manipulierte Datumsangaben | `--since`/`--until` und die Tageszuordnung werden ausschliesslich aus den validierten `week`/`year` berechnet; nie aus Client-Strings. |
| Informationsleck | Bei Fehlern werden weder Git-`stderr` noch der absolute Pfad an den Client gegeben – nur die generische Leere_Antwort. |

---

## Components and Interfaces

### `lib/date.ts` (Erweiterung)

Wiederverwendung der bestehenden ISO-Wochen-Logik. Neu hinzu kommt eine reine
Funktion, die die fünf Werktagsdaten einer ISO-Woche liefert:

```ts
/**
 * Liefert die Daten Montag–Freitag der ISO-Kalenderwoche {kw}/{jahr}
 * als "YYYY-MM-DD"-Strings (UTC-stabil, ohne Zeitzoneneffekte), zusammen
 * mit dem zugehörigen englischen Wochentags-Schlüssel der API.
 *
 * Index 0 = Montag … Index 4 = Freitag.
 */
export function isoWeekWorkdays(
  kw: number,
  jahr: number,
): { day: GitDay; date: string }[];
```

Berechnung analog zu `getCurrentWeek` über UTC-Mitternacht: Montag der ISO-Woche
bestimmen (KW 1 = Woche mit dem ersten Donnerstag), dann Montag…Freitag als
ISO-Datum (`YYYY-MM-DD`) ableiten. Diese Datumsstrings dienen sowohl als
`--since`/`--until`-Fenster für `git log` als auch als exakte Buckets für die
Tageszuordnung.

### `lib/git.ts` (neu)

Die gesamte Geschäftslogik. Reine, testbare Funktionen plus eine
Orchestrierungsfunktion mit dem einzigen Seiteneffekt (`git`-Aufruf).

```ts
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { GitSummary, GitDay } from "@/types/journal";

/** Erlaubte Pfadzeichen; Shell-Metazeichen führen zur Ablehnung. */
const VERBOTENE_PFADZEICHEN = /[;|&$`"'\n\r]/;

/** Trenner in der git-log-Ausgabe (Unit Separator, in Subjects unmöglich). */
const FELD = "\x1f";

/**
 * Liest die Commit-Titel der ISO-Woche {kw}/{jahr} aus dem Repository und
 * gruppiert sie nach Wochentag (Mo–Fr). Fehlertolerant: liefert bei jedem
 * Problem eine Leere_Antwort (fünf leere Listen).
 */
export function readGitSummary(
  repoPath: string,
  kw: number,
  jahr: number,
): GitSummary;

/**
 * Parst die rohe git-log-Ausgabe (eine Zeile pro Commit:
 * "<author>\x1f<YYYY-MM-DD>\x1f<subject>") in strukturierte Commits.
 * Reine Funktion – ohne git-Aufruf, damit isoliert testbar.
 */
export function parseGitLog(
  raw: string,
): { author: string; date: string; subject: string }[];

/**
 * Gruppiert geparste Commits nach Wochentag anhand der fünf Werktagsdaten.
 * Wendet Merge- und Author-Filter an. Reine Funktion.
 */
export function groupByWeekday(
  commits: { author: string; date: string; subject: string }[],
  workdays: { day: GitDay; date: string }[],
  configuredAuthor: string | null,
): Record<GitDay, string[]>;
```

**Ablauf von `readGitSummary`:**

1. **Pfad-Validierung:** `repoPath` gegen `VERBOTENE_PFADZEICHEN` prüfen → bei
   Treffer Leere_Antwort. Andernfalls `path.resolve(process.cwd(), repoPath)`
   (relativer Pfad gegen das Arbeitsverzeichnis des Servers, Requirement 8.3).
2. **Repo-Check:** `git rev-parse --is-inside-work-tree` im `cwd` ausführen;
   wirft der Aufruf (kein git, kein Repo, Pfad existiert nicht) → Leere_Antwort.
3. **Author bestimmen:** `git config user.name` im `cwd`; bei Fehler/leer →
   `configuredAuthor = null` (Filter wird später ausgelassen, Requirement 5.3).
4. **Datumsfenster:** `isoWeekWorkdays(kw, jahr)` liefert Mo–Fr. `--since` =
   Montag, `--until` = Samstag (Tag nach Freitag) als serverseitig berechnete
   Grenzen.
5. **`git log` ausführen:**
   ```
   git log --reverse --no-merges \
     --since=<montag> --until=<samstag> \
     --pretty=format:%an%x1f%ad%x1f%s --date=short
   ```
   - `--reverse`: älteste zuerst (Requirement 4.4).
   - `--date=short`: Author-Datum als `YYYY-MM-DD` in der Zeitzone des Commits –
     keine Offset-Parserei, zeitzonenstabile Tageszuordnung.
   - `%an` (Author-Name) und `%s` (Subject = erste Zeile) als Felder.
6. **Parsen & Gruppieren:** `parseGitLog(raw)` → `groupByWeekday(commits,
   workdays, configuredAuthor)`. Die Gruppierung
   - schliesst Commits aus, deren Subject mit `"Merge "` beginnt (Merge_Commit,
     Requirement 5.2 – zusätzlich zu `--no-merges` als fachliche Regel),
   - berücksichtigt nur Commits, deren `author === configuredAuthor` (sofern
     `configuredAuthor !== null`, Requirement 5.1/5.3),
   - ordnet jeden Commit per **exaktem Datums-String-Vergleich** dem passenden
     Werktag zu; Samstag/Sonntag und Daten ausserhalb der Woche matchen keinen
     Bucket und entfallen (Requirement 4.1/4.3).
7. Ergebnis: `{ monday, tuesday, wednesday, thursday, friday }` mit je einer
   (ggf. leeren) Liste.

Jeder `git`-Aufruf liegt in `try/catch`; ein Fehler liefert die Leere_Antwort.

### `app/api/git-summary/route.ts` (neu)

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  // 1. week/year validieren (Ganzzahl, Bereiche 1–53 / 2000–2100)
  //    → bei Verstoss Response mit Status 400 + beschreibender Meldung
  // 2. repoPath bestimmen: query.repoPath || GIT_REPO_PATH || "../inclusive-app-backend"
  // 3. readGitSummary(repoPath, week, year)
  // 4. Response.json({ week, year, days })
}
```

- **Validierung zuerst** (Requirement 2.2): `week` muss Ganzzahl in 1–53,
  `year` Ganzzahl in 2000–2100 sein; sonst HTTP 400 mit Klartextmeldung
  (z. B. `"Parameter 'week' muss eine ganze Zahl zwischen 1 und 53 sein."`).
- **Pfad-Auflösung** (Requirement 2.2 zweite Klausel/8.1/2.3):
  `repoPath`-Query → sonst `process.env.GIT_REPO_PATH` → sonst
  `DEFAULT_REPO_PATH = "../inclusive-app-backend"`.
- `week`/`year` werden unverändert in die Antwort übernommen (Requirement 2.6),
  auch bei Leere_Antwort (Requirement 6.3).
- Der Handler selbst wirft nicht: `readGitSummary` kapselt alle Git-Fehler und
  liefert im Zweifel die Leere_Antwort (Requirement 6.1/6.2).

### `components/DayCard.tsx` (Erweiterung)

Neue Props, additiv zur bestehenden Schnittstelle:

```ts
interface DayCardProps {
  // … bestehend …
  /** Für diesen Tag läuft gerade ein Git-Ladevorgang. */
  loadingGit: boolean;
  /** Lädt die Commit-Titel dieses Tages aus Git und fügt sie an. */
  onLoadFromGit: () => void;
}
```

UI: ein zweiter Button "Aus Git laden" **neben** dem bestehenden Generieren-Button
(Requirement 7.1), als Sekundärstil. Deaktiviert, wenn `busy` oder `loadingGit`;
zeigt während des Ladens einen Lade-Zustand (Requirement 7.5). Die Komponente
bleibt zustandslos/präsentational – die gesamte Logik liegt in `page.tsx`.

### `app/page.tsx` (Erweiterung)

Zentraler State erhält die Information, für welchen Wochentag gerade ein
Git-Ladevorgang läuft:

```ts
const [loadingGit, setLoadingGit] = useState<Weekday | null>(null);
```

Neue Funktion `loadFromGit(weekday)`:

1. `setLoadingGit(weekday)`.
2. `fetch("/api/git-summary?week={week.kw}&year={week.jahr}")` (GET).
3. Bei `!res.ok` → Abbruch, Stichwort-Feld unverändert (Requirement 7.7).
4. JSON lesen, englischen Tagesschlüssel über eine Mapping-Tabelle aus dem
   deutschen `Weekday` bestimmen, Liste `days[key]` holen.
5. Ist die Liste leer → unverändert lassen (Requirement 7.7).
6. Sonst neue Stichworte **anfügen**: bestehender Text bleibt erhalten, die
   Commit-Titel werden (zeilenweise) angehängt (Requirement 7.4) und über das
   bestehende `setStichworte(weekday, …)` persistiert.
7. Der gesamte Block liegt in `try/finally`; `finally` setzt `loadingGit` zurück.
   Tritt im `try` ein Fehler auf, bleibt das Feld unverändert (Requirement 7.6).

Das Anfügen wird als reine Hilfsfunktion ausgelagert (testbar):

```ts
// in lib/git-keywords.ts oder lib/journal.ts
export function appendKeywords(existing: string, titles: string[]): string;
```

Regel: leere `titles` → `existing` unverändert zurückgeben. Sonst die Titel mit
`\n` verbinden und – falls `existing` nicht leer ist – mit einem `\n` an
`existing` anhängen, ohne `existing` zu verändern.

Mapping deutscher `Weekday` → englischer `GitDay`:

```ts
const WEEKDAY_TO_GITDAY: Record<Weekday, GitDay> = {
  montag: "monday",
  dienstag: "tuesday",
  mittwoch: "wednesday",
  donnerstag: "thursday",
  freitag: "friday",
};
```

---

## Data Models

Ergänzungen in `types/journal.ts` (einzige Quelle der Wahrheit):

```ts
/** Englische Wochentags-Schlüssel der Git_Summary_API (Mo–Fr). */
export type GitDay =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

/** Antwortform von GET /api/git-summary. */
export interface GitSummary {
  /** Unveränderte Eingabe-Kalenderwoche (1–53). */
  week: number;
  /** Unverändertes Eingabe-Jahr (2000–2100). */
  year: number;
  /** Genau fünf Schlüssel monday–friday mit Listen von Commit-Titeln. */
  days: Record<GitDay, string[]>;
}
```

Eine **Leere_Antwort** ist ein `GitSummary`, dessen `days` für alle fünf
Schlüssel eine leere Liste enthält, mit unveränderten `week`/`year`.

Konstanten (in `lib/git.ts`):

```ts
const DEFAULT_REPO_PATH = "../inclusive-app-backend";
const GIT_DAYS: GitDay[] =
  ["monday", "tuesday", "wednesday", "thursday", "friday"];
```

Hinweis zur Sprachgrenze: Intern verwendet die App deutsche `Weekday`-Werte
(`montag`…`freitag`); die API verwendet bewusst englische Schlüssel
(`monday`…`friday`) gemäss Requirement 1.2. Die Umsetzung erfolgt im Frontend
über `WEEKDAY_TO_GITDAY`.

---

## Correctness Properties

*Eine Property ist eine Eigenschaft oder ein Verhalten, das über alle gültigen
Ausführungen des Systems hinweg gelten muss – eine formale Aussage darüber, was
das System tun soll. Properties bilden die Brücke zwischen menschenlesbarer
Spezifikation und maschinell prüfbaren Korrektheitsgarantien.*

Solche Tests eignen sich hier, weil die Kernlogik aus **reinen
Funktionen** besteht (Datumsberechnung, Parsen der git-Ausgabe, Gruppieren,
Filtern, Anfügen) und über einem grossen Eingaberaum (Commits, Daten, Strings,
Pfade) universelle Aussagen gelten. UI-Rendering, das konkrete Auslesen von
Query-Parametern, Konfigurations-Fallbacks und die `git`-Anbindung selbst werden
hingegen über Beispiel-/Integrationstests abgedeckt (siehe Teststrategie).

Die folgenden Properties sind nach der Prework-Analyse um Redundanzen bereinigt.

### Property 1: Ausgabe-Struktur-Invariante

*Für jede* gültige Kalenderwoche `week` (1–53) und jedes gültige `year`
(2000–2100) und für jede beliebige Menge geparster Commits liefert die
Gruppierung ein `days`-Objekt mit **genau** den fünf Schlüsseln `monday`,
`tuesday`, `wednesday`, `thursday`, `friday`, deren Werte jeweils ein `string[]`
sind, und die zurückgegebenen `week`/`year` sind identisch zur Eingabe.

**Validates: Requirements 1.1, 1.2, 1.3, 2.6, 6.3**

### Property 2: Validierung von week/year

*Für jeden* Wert von `week` ausserhalb der ganzen Zahlen 1–53 und *für jeden*
Wert von `year` ausserhalb der ganzen Zahlen 2000–2100 (einschliesslich fehlend
und nicht-ganzzahlig) antwortet die Git_Summary_API mit HTTP-Status 400, und es
findet keine weitere Verarbeitung (kein Git-Aufruf) statt.

**Validates: Requirements 2.2, 2.4, 2.5**

### Property 3: Korrekte Tagesgruppierung nach Datum

*Für jede* Menge von Commits mit beliebigen Datumswerten gilt: Der Titel eines
Commits erscheint genau dann in der Liste eines Werktags der Zielwoche, wenn das
Commit-Datum exakt dem Datum dieses Werktags (Mo–Fr) der durch `week`/`year`
definierten ISO-Woche entspricht. Commits an Samstag/Sonntag oder ausserhalb der
Woche erscheinen in keiner Liste.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Chronologische Reihenfolge je Tag

*Für jede* Menge von Commits ist die Titelliste jedes Wochentags in
chronologischer Reihenfolge (ältester zuerst) sortiert.

**Validates: Requirements 4.4**

### Property 5: Author-Filter inklusive Fallback

*Für jede* Menge von Commits gilt: Ist ein Konfigurierter_Author gesetzt,
enthalten alle fünf Listen ausschliesslich Commit-Titel dieses Authors; ist kein
Konfigurierter_Author bestimmbar (`null`), bleiben alle sonst berücksichtigten
Commits (nach Datums- und Merge-Filter) erhalten.

**Validates: Requirements 5.1, 5.3**

### Property 6: Merge-Commits ausgeschlossen

*Für jede* Menge von Commits beginnt kein Titel im Ergebnis mit dem Präfix
`"Merge "`.

**Validates: Requirements 5.2**

### Property 7: Pfade mit Metazeichen ergeben eine Leere_Antwort

*Für jeden* Repository_Pfad, der mindestens eines der Shell-Metazeichen
(`;`, `|`, `&`, `$`, Backtick, `"`, `'`) enthält, liefert der Git_Reader eine
Leere_Antwort (fünf leere Listen), ohne einen Git-Befehl auszuführen.

**Validates: Requirements 3.4**

### Property 8: Kein nutzbares Repository ergibt eine Leere_Antwort

*Für jeden* (metazeichenfreien) Pfad, der nicht auf ein nutzbares Git-Repository
zeigt oder bei dem die Git-Ausführung fehlschlägt, liefert der Git_Reader eine
Leere_Antwort mit den unveränderten `week`/`year`.

**Validates: Requirements 3.2, 6.2**

### Property 9: Fehlerfälle leaken keine internen Details

*Für jeden* Fehlerfall, der eine Leere_Antwort auslöst, enthält der an den
Client zurückgegebene Antwort-Body weder den (absoluten) Repository_Pfad noch
Roh-`stderr`-Ausgaben des Git-Befehls.

**Validates: Requirements 6.4**

### Property 10: Anfügen erhält bestehenden Inhalt

*Für jeden* bestehenden Stichwort-Text `existing` und *für jede* Liste von
Commit-Titeln `titles` gilt: `appendKeywords(existing, titles)` beginnt mit
`existing` (bestehender Inhalt bleibt unverändert erhalten) und enthält alle
Titel; ist `titles` leer, ist das Ergebnis exakt `existing`.

**Validates: Requirements 7.4, 7.6, 7.7**

---

## Error Handling

Leitprinzip: **Fehlertoleranz statt Absturz.** Der Git_Reader kapselt jede
Fehlerquelle und liefert im Zweifel die Leere_Antwort; die API bleibt damit auch
ohne lauffähige Git-Umgebung bedienbar.

| Fall | Schicht | Verhalten |
|------|---------|-----------|
| `week`/`year` ungültig | Route Handler | HTTP 400 mit beschreibender Klartextmeldung (vor jedem Git-Aufruf) |
| `repoPath` mit Shell-Metazeichen | `lib/git.ts` | Leere_Antwort, kein Git-Aufruf (Property 7) |
| Pfad existiert nicht / kein Git-Repo | `lib/git.ts` | `git rev-parse` wirft → Leere_Antwort (Property 8) |
| `git`-Binary nicht installiert | `lib/git.ts` | `execFileSync` wirft (`ENOENT`) → Leere_Antwort |
| `git log` schlägt fehl | `lib/git.ts` | `try/catch` → Leere_Antwort |
| `git config user.name` leer/Fehler | `lib/git.ts` | `configuredAuthor = null`, Author-Filter ausgelassen (Property 5) |
| Git-Lade-Request schlägt im Client fehl | `page.tsx` | Stichwort-Feld unverändert, `loadingGit` zurückgesetzt (Property 10) |
| Leere Tagesliste vom Server | `page.tsx` | Stichwort-Feld unverändert (Property 10) |

Wichtig (Requirement 6.4 / Property 9): In keinem Fehlerfall werden Git-`stderr`
oder der aufgelöste absolute Pfad an den Client gegeben. Der Route Handler gibt
ausschliesslich die strukturierte Leere_Antwort zurück; Diagnoseausgaben bleiben
serverseitig (und enthalten keine Geheimnisse).

---

## Testing Strategy

> **Steering-Abgleich:** `tech.md` nennt "kein Test-Framework". Tatsächlich sind
> **Vitest 4** und **fast-check 4** installiert und in `lib/*.test.ts` in
> Gebrauch (z. B. `journal.test.ts`, `storage.test.ts`). Diese Strategie nutzt
> daher das vorhandene Setup; es werden **keine** neuen Dependencies eingeführt.
> Empfehlung: `tech.md` bei Gelegenheit an die Realität anpassen.

### Dualer Ansatz

- **Property-Tests (fast-check + Vitest):** universelle Eigenschaften der reinen
  Logik in `lib/git.ts`, `lib/date.ts` und `appendKeywords` – siehe Properties
  1–10. Mindestens **100 Iterationen** pro Property (`fc.assert(fc.property(…),
  { numRuns: 100 })`).
- **Beispiel-/Unit-Tests:** konkrete Szenarien, die sich nicht universell
  formulieren lassen oder externes Verhalten betreffen.

Jeder Property-Test wird mit einem Kommentar im Format
**`Feature: git-day-entries, Property {Nummer}: {Property-Text}`** versehen und
referenziert damit die Design-Property.

### Property-Tests (Zuordnung)

| Property | Testort | Generatoren / Vorgehen |
|----------|---------|------------------------|
| P1 Struktur | `lib/git.test.ts` | beliebige Commit-Listen + gültige week/year → fünf Schlüssel, `string[]`, week/year unverändert |
| P2 Validierung | `app/api/git-summary/route.test.ts` | ungültige week/year (out-of-range, float, fehlend) → Status 400 |
| P3 Gruppierung | `lib/git.test.ts` | Commits mit generierten Datumsstrings (innerhalb/ausserhalb, Sa/So) → korrekte Buckets |
| P4 Reihenfolge | `lib/git.test.ts` | gemischte Reihenfolge → je Tag aufsteigend sortiert |
| P5 Author-Filter | `lib/git.test.ts` | Author-Mischungen + `configuredAuthor` ∈ {Name, null} |
| P6 Merge-Filter | `lib/git.test.ts` | Subjects mit/ohne "Merge "-Präfix → keine "Merge "-Titel im Ergebnis |
| P7 Metazeichen | `lib/git.test.ts` | Pfade mit injizierten Metazeichen → Leere_Antwort, kein git-Aufruf (Spion/Stub) |
| P8 kein Repo | `lib/git.test.ts` | generierte Nicht-Repo-Pfade (z. B. temporäre Nicht-Git-Verzeichnisse) → Leere_Antwort |
| P9 kein Leak | `lib/git.test.ts` / route-Test | Fehlerfälle → Body enthält weder Pfad noch stderr |
| P10 Anfügen | `lib/git-keywords.test.ts` | beliebige `existing` + `titles` (inkl. leer) → Präfix-Erhalt, leere Liste = identisch |

Hinweis zu P3/P4/P5/P6: Diese Properties testen die **reine** Funktion
`groupByWeekday` (bzw. `parseGitLog`) ohne echten `git`-Aufruf – schnell und
deterministisch, daher problemlos mit 100+ Iterationen.

### Beispiel-, Integrations- und Smoke-Tests

- **EXAMPLE** – Route-Handler-Mechanik: Auslesen der Query-Parameter (2.1),
  Fallback-Kette `repoPath` → `GIT_REPO_PATH` → Default (2.2b, 2.3, 8.1),
  relative Pfadauflösung gegen `cwd` (8.3), HTTP 200 bei Erfolg (1.4),
  `execFileSync`-Aufruf mit Argument-Array statt Shell (3.1, per Spion).
- **EXAMPLE** – UI: "Aus Git laden"-Button vorhanden (7.1), Klick löst GET mit
  korrekter KW/Jahr aus (7.2), Antwort füllt das Feld (7.3), Button während
  Laden deaktiviert (7.5). Mit gemocktem `fetch`.
- **EDGE_CASE** – leerer Tag → `[]` (4.5, durch Generatoren in P3 mitabgedeckt);
  Fehler beim Einfügen lässt Feld unverändert (7.6, durch P10 mitabgedeckt).
- **INTEGRATION** – fehlendes `git`-Binary → Leere_Antwort (6.1): ein gezielter
  Test (z. B. manipulierter `PATH` oder gemocktes `child_process`), keine
  100 Iterationen.
- **SMOKE** – `runtime`/`dynamic`-Exporte gesetzt (1.5); `GIT_REPO_PATH` in
  `.env.example` dokumentiert (8.2). Einmalige Prüfungen.

### Verifikation nach Implementierung

- `npm run lint` ohne Fehler.
- `npx tsc --noEmit` (strict) ohne Fehler.
- `npm test` (`vitest run`) – alle Property- und Beispieltests grün.
- Manueller Durchlauf: Woche wählen → "Aus Git laden" je Tag → Stichworte werden
  angefügt (bestehender Inhalt bleibt) → ohne/mit gesetztem `GIT_REPO_PATH` →
  Verhalten bei nicht existierendem Repo (leer, kein Absturz).
