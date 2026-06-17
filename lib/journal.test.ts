import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  composeJournal,
  displayedJournal,
  journalFileName,
  withJournalText,
  withoutJournalText,
} from "@/lib/journal";
import type { DayEntry, WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

const RUNS = 100;

/** Arbitrary für einen einzelnen Tageseintrag eines gegebenen Wochentags. */
function dayArbitrary(weekday: DayEntry["weekday"]): fc.Arbitrary<DayEntry> {
  return fc.record({
    weekday: fc.constant(weekday),
    stichworte: fc.string(),
    text: fc.string(),
  });
}

/** Arbitrary für die fünf Tageseinträge (Mo–Fr) in der Reihenfolge von WEEKDAYS. */
const daysArbitrary: fc.Arbitrary<DayEntry[]> = fc.tuple(
  ...WEEKDAYS.map(({ key }) => dayArbitrary(key)),
);

/** Arbitrary für eine vollständige Woche inkl. optionaler Überschreibung. */
const weekArbitrary: fc.Arbitrary<WeekJournal> = fc.record({
  id: fc.string(),
  kw: fc.integer({ min: 1, max: 53 }),
  jahr: fc.integer({ min: 1000, max: 9999 }),
  days: daysArbitrary,
  reflexion: fc.string(),
  // Deckt fehlend (undefined), leer/whitespace und echten Inhalt ab.
  journalText: fc.option(fc.string(), { nil: undefined }),
  // Gültiger ISO-String aus einem begrenzten Zeitstempel (vermeidet Invalid Date).
  updatedAt: fc
    .integer({ min: 0, max: 4_102_444_800_000 })
    .map((ms) => new Date(ms).toISOString()),
});

describe("journal pure logic – property based", () => {
  // Feature: journal-redesign-edit, Property 1
  // Validates: Requirements 2.2, 2.4, 6.4, 7.1
  it("Property 1: Override-Präzedenz – displayedJournal nutzt nicht-leere Überschreibung, sonst composeJournal", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const result = displayedJournal(week);
        const hatUeberschreibung =
          typeof week.journalText === "string" &&
          week.journalText.trim() !== "";

        if (hatUeberschreibung) {
          expect(result).toBe(week.journalText);
        } else {
          expect(result).toBe(composeJournal(week));
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: journal-redesign-edit, Property 2
  // Validates: Requirements 2.3, 2.8, 2.10
  it("Property 2: Überschreibungs-Lebenszyklus – withJournalText/withoutJournalText setzen und entfernen korrekt", () => {
    fc.assert(
      fc.property(weekArbitrary, fc.string(), (week, value) => {
        const gesetzt = withJournalText(week, value);

        if (value.trim() !== "") {
          // Nicht-leerer Wert: Überschreibung wird unverändert übernommen.
          expect(gesetzt.journalText).toBe(value);
        } else {
          // Leerer/whitespace-Wert: keine Überschreibung.
          expect(gesetzt.journalText).toBeUndefined();
        }

        // withoutJournalText entfernt die Überschreibung immer.
        const entfernt = withoutJournalText(gesetzt);
        expect(entfernt.journalText).toBeUndefined();

        // Nach dem Entfernen entspricht der angezeigte Text dem abgeleiteten Text.
        expect(displayedJournal(entfernt)).toBe(composeJournal(entfernt));
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: journal-redesign-edit, Property 6
  // Validates: Requirements 7.2
  it("Property 6: Dateiname-Formatierung – KW zweistellig (führende Null), Jahr vierstellig", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const name = journalFileName(week);
        const kw = String(week.kw).padStart(2, "0");
        const jahr = String(week.jahr).padStart(4, "0");

        expect(name).toBe(`arbeitsjournal-kw${kw}-${jahr}.txt`);
        expect(name).toMatch(/^arbeitsjournal-kw\d{2}-\d{4}\.txt$/);
      }),
      { numRuns: RUNS },
    );
  });
});
