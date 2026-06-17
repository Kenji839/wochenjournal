import { describe, it, expect, afterEach, vi } from "vitest";
import fc from "fast-check";

import { saveWeek, loadWeeks } from "@/lib/storage";
import {
  composeJournal,
  displayedJournal,
  hasManualOverride,
  withoutJournalText,
} from "@/lib/journal";
import type { DayEntry, WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

// Spiegelt den internen Storage-Key aus lib/storage.ts (dort nicht exportiert).
const STORAGE_KEY = "wochenjournal_weeks";

// In-Memory-Mock für window.localStorage. Nur die von storage.ts genutzten
// Methoden werden implementiert; setFailSet simuliert einen Schreibfehler
// (z. B. Quota), seed legt Bestandsdaten direkt ab.
interface LocalStorageMock {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  setFailSet(fail: boolean): void;
  seed(key: string, value: string): void;
}

function createLocalStorageMock(): LocalStorageMock {
  const store = new Map<string, string>();
  let fail = false;
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      if (fail) throw new Error("QuotaExceededError");
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setFailSet: (f) => {
      fail = f;
    },
    seed: (key, value) => {
      store.set(key, value);
    },
  };
}

function installMock(): LocalStorageMock {
  const mock = createLocalStorageMock();
  vi.stubGlobal("window", { localStorage: mock as unknown as Storage });
  return mock;
}

// --- Generatoren -----------------------------------------------------------

const daysArb: fc.Arbitrary<DayEntry[]> = fc
  .array(fc.record({ stichworte: fc.string(), text: fc.string() }), {
    minLength: WEEKDAYS.length,
    maxLength: WEEKDAYS.length,
  })
  .map((entries) =>
    entries.map((e, i) => ({ weekday: WEEKDAYS[i].key, ...e })),
  );

const idArb = fc.uuid();
const kwArb = fc.integer({ min: 1, max: 53 });
const jahrArb = fc.integer({ min: 2000, max: 2100 });
const updatedAtArb = fc.constant(new Date().toISOString());

// Woche mit optionaler Überschreibung (allgemeiner Fall).
const weekArb: fc.Arbitrary<WeekJournal> = fc.record(
  {
    id: idArb,
    kw: kwArb,
    jahr: jahrArb,
    days: daysArb,
    reflexion: fc.string(),
    journalText: fc.string(),
    updatedAt: updatedAtArb,
  },
  { requiredKeys: ["id", "kw", "jahr", "days", "reflexion", "updatedAt"] },
);

// Woche mit garantiert nicht-leerer Überschreibung (nach Trim).
const weekWithOverrideArb: fc.Arbitrary<WeekJournal> = fc.record({
  id: idArb,
  kw: kwArb,
  jahr: jahrArb,
  days: daysArb,
  reflexion: fc.string(),
  journalText: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
  updatedAt: updatedAtArb,
});

// Bestandswoche ohne Feld journalText.
const weekWithoutOverrideArb: fc.Arbitrary<WeekJournal> = fc.record({
  id: idArb,
  kw: kwArb,
  jahr: jahrArb,
  days: daysArb,
  reflexion: fc.string(),
  updatedAt: updatedAtArb,
});

describe("lib/storage – Property-Based-Tests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Property 3: journalText-Persistenz-Round-Trip", () => {
    // Feature: journal-redesign-edit, Property 3
    // Validates: Requirements 6.2, 6.5
    fc.assert(
      fc.property(weekWithOverrideArb, (week) => {
        installMock();

        // Nicht-leerer journalText überlebt saveWeek -> loadWeeks unverändert.
        saveWeek(week);
        const loaded = loadWeeks().find((w) => w.id === week.id);
        expect(loaded).toBeDefined();
        expect(loaded!.journalText).toBe(week.journalText);

        // Nach withoutJournalText enthält die persistierte Woche kein journalText.
        saveWeek(withoutJournalText(loaded!));
        const loaded2 = loadWeeks().find((w) => w.id === week.id);
        expect(loaded2).toBeDefined();
        expect("journalText" in loaded2!).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 4: Rückwärtskompatibles Laden", () => {
    // Feature: journal-redesign-edit, Property 4
    // Validates: Requirements 6.6
    fc.assert(
      fc.property(
        fc.array(weekWithoutOverrideArb, { maxLength: 10 }),
        (weeks) => {
          const mock = installMock();
          // Bestandsdaten ohne journalText direkt als JSON ablegen.
          mock.seed(STORAGE_KEY, JSON.stringify(weeks));

          const loaded = loadWeeks();
          expect(loaded.length).toBe(weeks.length);
          for (const w of loaded) {
            expect(hasManualOverride(w)).toBe(false);
            expect(displayedJournal(w)).toBe(composeJournal(w));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 5: Schreibfehler-Invarianz", () => {
    // Feature: journal-redesign-edit, Property 5
    // Validates: Requirements 6.3
    fc.assert(
      fc.property(weekArb, weekArb, (ersteWoche, zweiteWoche) => {
        const mock = installMock();

        // Zuvor erfolgreich gespeicherter Stand.
        saveWeek(ersteWoche);
        const vorher = loadWeeks();
        const vorherJSON = mock.getItem(STORAGE_KEY);

        // setItem schlägt nun fehl (Quota-Simulation).
        mock.setFailSet(true);
        const result = saveWeek(zweiteWoche);

        // saveWeek liefert die vorherige Liste zurück ...
        expect(result).toEqual(vorher);
        // ... und der gespeicherte Stand bleibt unverändert.
        expect(mock.getItem(STORAGE_KEY)).toBe(vorherJSON);
      }),
      { numRuns: 100 },
    );
  });
});
