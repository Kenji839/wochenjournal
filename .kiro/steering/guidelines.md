# Arbeits-Guidelines – Wochenjournal-Generator

Verhaltensregeln, um typische Fehler zu vermeiden und die Arbeit geordnet zu
halten. Gilt zusätzlich zu `AGENTS.md`.

**Tradeoff:** Diese Regeln gewichten Sorgfalt über Tempo. Bei trivialen Aufgaben
mit gesundem Menschenverstand abweichen.

---

## 1. Erst denken, dann coden

**Nicht annehmen. Verwirrung nicht verstecken. Tradeoffs offenlegen.**

- Annahmen explizit nennen. Bei Unsicherheit nachfragen.
- Mehrere Interpretationen → vorlegen, nicht still eine wählen.
- Gibt es einen einfacheren Weg, sag es. Widersprich, wenn angebracht.
- Ist etwas unklar, stopp. Benenne, was unklar ist. Frag nach.

## 2. Einfachheit zuerst

**Minimaler Code, der das Problem löst. Nichts Spekulatives.**

- Keine Features über das Verlangte hinaus.
- Keine Abstraktionen für einmalig genutzten Code.
- Keine "Flexibilität" / "Konfigurierbarkeit", die nicht gefragt war.
- Keine Fehlerbehandlung für unmögliche Fälle.
- Würde eine erfahrene Entwicklerin sagen "überkompliziert"? Wenn ja: vereinfachen.

## 3. Chirurgische Änderungen

**Nur anfassen, was nötig ist. Nur den eigenen Schlamassel aufräumen.**

- Angrenzenden Code, Kommentare oder Formatierung nicht "verbessern".
- Nichts refactoren, was nicht kaputt ist.
- Bestehenden Stil übernehmen, auch wenn man es anders machen würde.
- Fremden toten Code erwähnen, nicht löschen.
- Durch eigene Änderungen verwaiste Imports/Variablen entfernen.
- Jede geänderte Zeile muss direkt auf den Auftrag zurückführbar sein.

## 4. Zielgetriebene Umsetzung

**Erfolgskriterien definieren. Bis zur Verifikation iterieren.**

Bei mehrstufigen Aufgaben einen kurzen Plan nennen:

```
1. [Schritt] → prüfen: [Check]
2. [Schritt] → prüfen: [Check]
```

Nach Code-Änderungen immer verifizieren: `npm run lint`, `npx tsc --noEmit`,
bei Bedarf `npm run build`.

---

## Projektspezifische Regeln

### Stack-Realität

- Es läuft **Next.js 16.2.9, React 19, Tailwind v4** – nicht Next.js 14.
- Vor dem Schreiben von Next.js-Code bei Unsicherheit die gebündelten Docs in
  `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`). Deprecation-Hinweise
  beachten.
- Route Handler nutzen Web-`Request`/`Response` und `ReadableStream`.

### Sicherheit

- `GEMINI_API_KEY` **nur** serverseitig (`process.env`), nie mit
  `NEXT_PUBLIC_`-Präfix, nie im Client-Bundle, nie ins Log schreiben.
- `.env.local` nicht versionieren.
- Externe/streamende Inhalte als unsicher behandeln; keine Geheimnisse echoen.

### Sprache und Format

- Generierte Journalinhalte in **Schweizer Hochdeutsch**: kein "ß", immer "ss".
- Die gesamte **UI ist auf Deutsch**.
- Das fixe Journalformat (Header, Tagesabsätze Mo–Fr, vier Reflexionsabschnitte)
  exakt einhalten – siehe `requirements.md` / `design.md`.
- **Keine Details erfinden** – nur verwenden, was der Nutzer eingegeben hat.

### Architektur-Disziplin

- Generierung ist inkrementell: Tagesabsätze einzeln, Reflexion am Schluss.
- Persistenz nur über `lib/storage.ts` (localStorage), SSR-sicher
  (`typeof window` prüfen).
- Prompts und Prompt-Builder nur in `lib/prompt.ts`.
- Typen in `types/journal.ts` synchron zu API-Request/Response halten.
- Keine neuen Dependencies ausser dem, was die Spec vorsieht
  (`@google/genai`).

### Spec-Workflow

- Reihenfolge respektieren: Requirements → Design → Tasks → Implementierung.
- Vor dem Start der Tasks auf Freigabe ("OK") warten.
- Tasks einzeln abarbeiten und nach grösseren Schritten den Stand zeigen.

---

**Diese Guidelines wirken, wenn:** weniger unnötige Änderungen im Diff, weniger
Rewrites wegen Überkomplexität, und Rückfragen kommen vor der Implementierung
statt nach Fehlern.
