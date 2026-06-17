# Implementation Plan: Modern UI Redesign

## Overview

Reines UI-/Layout-Redesign mit chirurgischen Änderungen. Es werden ausschliesslich
Designtokens in `app/globals.css` sowie `className`-Werte (und einzelne
`rows`-Attribute) in `app/page.tsx` und den fünf Komponenten angepasst. Props,
Callbacks, Hook-Logik, Streaming-Lesen und Storage-Aufrufe bleiben bytegenau
erhalten. Keine neuen Abhängigkeiten.

Die Reihenfolge ist inkrementell: Zuerst werden die markenneutralen Tokens
bereitgestellt (Fundament für alle Utilities), dann das Seitenlayout umgebaut,
anschliessend die Komponenten-Klassen migriert und zum Schluss verifiziert.

Hinweis: Property-Based Testing entfällt für dieses Feature bewusst (Begründung
im Design unter „Correctness Properties"). Es existiert kein
Komponenten-Test-Framework; die Verifikation erfolgt über `npm run lint`,
`npx tsc --noEmit`, `npm run build`, eine Markenneutralitäts-/Token-Suche sowie
manuelle Layout- und Zugänglichkeitsprüfungen durch den Nutzer.

## Tasks

- [x] 1. Markenneutrale Designtokens bereitstellen
  - [x] 1.1 `@theme`-Block in `app/globals.css` umstellen
    - SBB-Tokens (`--color-sbb-red`, `--color-sbb-red-hover`) entfernen und durch
      semantische, markenneutrale Tokens ersetzen
    - Flächen/Neutraltöne ergänzen: `--color-page`, `--color-panel`,
      `--color-panel-muted`, `--color-ink`, `--color-line`
    - Primär-/Akzentfarbe (nicht SBB-Rot) ergänzen: `--color-primary`,
      `--color-primary-hover`, `--color-on-primary`
    - Statusfarbe Fehler ergänzen: `--color-danger`, `--color-danger-hover`
    - Fokusindikator ergänzen: `--color-focus`
    - Eckenradien ergänzen: `--radius-control` (Controls), `--radius-card` (Karten)
    - Lesbreite ergänzen: `--container-measure` (75ch) für `max-w-measure`
    - `--font-sans` und die `body`-Regel unverändert lassen
    - Farbwerte so wählen, dass Kontrast Text ≥ 4,5:1 und grosser Text/Grafik/Fokus ≥ 3:1 plausibel erfüllt sind
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 5.1, 6.3, 6.4, 6.5_

- [x] 2. Seitenlayout in `app/page.tsx` umbauen
  - [x] 2.1 Seitencontainer und Hauptraster auf volle Breite umstellen
    - Wurzel-`div` von `mx-auto max-w-6xl px-4 py-6` auf `w-full px-4 sm:px-12 py-6 sm:py-8` ändern (kein `mx-auto`, keine `max-width`)
    - Hauptraster auf `grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start` umstellen
    - Explizite Spalten-/Zeilen-Platzierung (`lg:col-start-*`, `lg:row-start-*`, `lg:row-span-*`) durch zwei Container ersetzen: **Seitenleiste** (`flex flex-col gap-6`) mit `WeekSelector` + `HistoryPanel`, **Inhaltsspalte** (`flex flex-col gap-6`) mit Tageskarten-Raster, `ReflectionPanel`, `JournalPreview`
    - DOM-Reihenfolge Seitenleiste → Inhaltsspalte herstellen (korrekte einspaltige Reihenfolge und Tab-Reihenfolge)
    - Tageskarten-Raster auf `grid grid-cols-1 lg:grid-cols-5 gap-4` umstellen
    - Alle Props/Callbacks an `WeekSelector`, `HistoryPanel`, `DayCard`, `ReflectionPanel`, `JournalPreview` unverändert durchreichen
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.6_

  - [x] 2.2 Kopfzeile und Fehler-Toast tokenisieren
    - Kopfzeile: Titel auf `text-3xl sm:text-4xl font-bold text-ink`, Untertitel markenneutral (`text-ink/60`, ohne SBB-Bezug)
    - Fehler-Toast: Position `fixed bottom-4 right-4` beibehalten; `border-sbb-red`/`text-sbb-red` durch `border-danger`/`text-danger` ersetzen; `rounded-lg` → `rounded-card`
    - `role="alert"`, `aria-label="Meldung schliessen"` und das Verhalten „sichtbar bis Schliessen" unverändert lassen
    - _Requirements: 2.9, 3.3, 3.6, 6.1, 6.2_

- [x] 3. className-Migration der Komponenten
  - [x] 3.1 `components/WeekSelector.tsx` migrieren
    - Tokens umstellen: `bg-sbb-red`→`bg-primary`, `hover:bg-sbb-red-hover`→`hover:bg-primary-hover`, `focus:border-sbb-red`→`focus:border-primary`, `rounded-lg`→`rounded-card`, `rounded-md`→`rounded-control`
    - Karten-Innenabstand auf `p-5`, Bereichstitel auf `text-base font-semibold` mit `mb-3` vereinheitlichen
    - Eingaben/Buttons: einheitlichen Fokusring ergänzen (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2`)
    - Keine arbiträren Werte (`*-[#...]`, `*-[..px]`, `*-[..rem]`) verwenden
    - Props (`kw`, `jahr`, `onChange`) unverändert lassen
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.3_

  - [x] 3.2 `components/DayCard.tsx` migrieren
    - Tokens umstellen (Primär-Button, Karte, Controls) gemäss Migrationsabbildung; arbiträre Werte vermeiden
    - Stichwort-`textarea` von `rows={2}` auf `rows={3}` anheben; `resize-y` beibehalten; Tagesabsatz-`textarea` (`rows={4}`) unverändert
    - Karten-Innenabstand `p-5`, Bereichstitel `text-base font-semibold` + `mb-3`, Fliesstext/Felder `text-sm`
    - Einheitlichen Fokusring auf Button und Textfeldern ergänzen
    - Sperren während Generierung (`busy`/`streaming`) und Streaming-Hinweis-Verhalten unverändert lassen; Props/Callbacks unverändert
    - _Requirements: 2.3, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4, 5.5, 6.3_

  - [x] 3.3 `components/ReflectionPanel.tsx` migrieren
    - Tokens umstellen (Primär-Button, Karte, Controls); arbiträre Werte vermeiden
    - Karten-Innenabstand `p-5`, Bereichstitel `text-base font-semibold` + `mb-3`, Fliesstext `text-sm`
    - Reflexions-`textarea` (`rows={12}`) unverändert, `resize-y` beibehalten
    - Einheitlichen Fokusring ergänzen; Sperren/Streaming-Hinweis und Props/Callbacks unverändert
    - _Requirements: 2.4, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4, 5.5, 6.3_

  - [x] 3.4 `components/JournalPreview.tsx` migrieren
    - Tokens umstellen für alle Bedienelemente (Kopieren, Download, Confluence-Upload, KI-Überarbeitung, Verwerfen); Fehlerblock auf `border-danger`/`text-danger`
    - Gesamtjournal-Editor: `max-w-measure` (75ch) + Zeilenumbruch ergänzen, linksbündig im breiten Panel; `rows={18}` und `resize-y` beibehalten
    - Karten-Innenabstand `p-5`, Bereichstitel `text-base font-semibold` + `mb-3`, Fliesstext `text-sm`
    - Einheitlichen Fokusring auf allen Controls ergänzen; lokale Statuszustände (`loading`/`success`/`error`) und alle Props/Callbacks unverändert
    - Keine arbiträren Werte verwenden
    - _Requirements: 2.5, 2.6, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3_

  - [x] 3.5 `components/HistoryPanel.tsx` migrieren
    - Tokens umstellen (aktive Auswahl/Hover, Löschen-Button, Karte); `bg-sbb-red/5`/`hover:bg-sbb-red/5`→`bg-primary/5`/`hover:bg-primary/5`; arbiträre Werte vermeiden
    - Karten-Innenabstand `p-5`, Bereichstitel `text-base font-semibold` + `mb-3`
    - Einheitlichen Fokusring ergänzen; `aria-label` am Icon-/Löschen-Button beibehalten; Verhalten „max. 10 Wochen", Auswahl und Löschen sowie Props/Callbacks unverändert
    - _Requirements: 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.2, 6.3_

- [x] 4. Markenneutralität und arbiträre Werte prüfen
  - [x] 4.1 Token-/Markenneutralitäts-Suche durchführen und Restfunde beheben
    - Per Suche sicherstellen: kein Vorkommen von `sbb-red` bzw. `sbb` mehr in `app/page.tsx` und `components/*`
    - Per Suche sicherstellen: keine arbiträren Tailwind-Werte (`*-[#...]`, `*-[..px]`, `*-[..rem]`) in den geänderten Dateien
    - Etwaige Restfunde auf die entsprechenden Tokens umstellen
    - _Requirements: 3.2, 3.6_

- [x] 5. Checkpoint – statische Verifikation
  - `npm run lint`, `npx tsc --noEmit` und `npm run build` ausführen; alle müssen fehlerfrei durchlaufen. Bei offenen Fragen den Nutzer fragen. Die manuellen Layout- und Zugänglichkeitsprüfungen (Viewport-Breiten, Tastaturnavigation, Kontrast) führt der Nutzer per `npm run dev` selbst durch.

## Notes

- Mit `*` markierte Sub-Tasks wären optional; dieses Feature enthält keine, da
  kein Test-Framework existiert und PBT bewusst entfällt.
- Jede geänderte Zeile muss auf den Auftrag zurückführbar sein (chirurgische
  Änderungen): nur `className`-Werte, `rows`-Attribute und Tokens – keine
  Logik-, Props- oder State-Änderungen.
- Task 1.1 ist das Fundament: Die neuen Utilities (`bg-primary`, `rounded-card`,
  `max-w-measure`, `ring-focus` usw.) müssen existieren, bevor die übrigen
  Dateien sie verwenden.
- Verifikation nach jeder Änderung gemäss Steering: `npm run lint`,
  `npx tsc --noEmit`, bei Bedarf `npm run build`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["4.1"] }
  ]
}
```
