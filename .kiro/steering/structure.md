# Projektstruktur & Konventionen

## Verzeichnisse

```
app/                    ← Next.js App Router (Seiten, Layout, API-Routen)
  api/<name>/route.ts   ← Route Handler (Server)
  page.tsx              ← Seite (hier: Client Component mit zentralem State)
  layout.tsx            ← Root Layout
  globals.css           ← globale Styles / Tailwind / Theme-Tokens
components/             ← wiederverwendbare UI-Komponenten (Client)
lib/                    ← Logik ohne JSX (Helper, Storage, Prompts, API-Client)
types/                  ← geteilte TypeScript-Typen
.kiro/                  ← Spec, Steering, Hooks (kein App-Code)
```

Neue App-Logik gehört nach `lib/`, neue UI nach `components/`, geteilte Typen
nach `types/`. Keine Geschäftslogik in Komponenten, die in `lib/` gehört.

## Namenskonventionen

- **Komponenten-Dateien**: PascalCase, eine Komponente pro Datei
  (`DayCard.tsx`). Default-Export der Komponente.
- **lib-/types-Dateien**: camelCase-Dateinamen (`storage.ts`, `journal.ts`),
  benannte Exporte.
- **Funktionen/Variablen**: camelCase. **Typen/Interfaces**: PascalCase.
- **Konstanten**: `UPPER_SNAKE_CASE` für echte Konstanten
  (`SYSTEM_PROMPT_DAY`), sonst camelCase (`WEEKDAYS`).

## Imports

- Pfad-Alias `@/*` ist in `tsconfig.json` gesetzt → projektweite Imports als
  `@/lib/...`, `@/types/journal`, `@/components/...` statt relativer `../../`.
- Reihenfolge: externe Pakete → `@/`-Module → relative Imports.

## Client vs. Server

- Dateien mit Hooks/Events/Browser-APIs brauchen `"use client"` ganz oben
  (`page.tsx`, alle `components/*`).
- `route.ts` und reine `lib/`-Logik bleiben serverfähig; `lib/storage.ts` nutzt
  Browser-APIs und ist daher nur clientseitig sinnvoll (SSR-Guard via
  `typeof window`).
- `process.env.GEMINI_API_KEY` **nur** in serverseitigem Code
  (`app/api/.../route.ts`, `lib/ai.ts`).

## State & Daten

- Zentraler UI-State in `app/page.tsx`; Kinder erhalten Props + Callbacks
  (keine globale State-Library).
- `localStorage`-Zugriffe ausschliesslich über `lib/storage.ts`.
- `types/journal.ts` ist die einzige Quelle der Wahrheit für die Datenformen.

## Stil

- TypeScript strict, kein `any` ohne Begründung.
- Funktionskomponenten + Hooks, keine Klassen.
- Bestehenden Stil übernehmen; nur ändern, was die Aufgabe verlangt
  (siehe `guidelines.md`).
