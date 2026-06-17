import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildRevisePrompt } from "@/lib/prompt";

// Feature: journal-redesign-edit, Property 7
// Property 7: buildRevisePrompt enthält die getrimmten Eingaben
// Für jede Kombination aus `journalText` und `anweisung` liefert
// buildRevisePrompt({ mode: "revise", journalText, anweisung }) ein Objekt mit
// nicht-leerem `system` und `user`, wobei `user` sowohl den getrimmten
// `journalText` als auch die getrimmte `anweisung` verbatim als Teilstring enthält.
// Validates: Requirements 4.2, 4.3

/**
 * Generator für eine Eingabe, deren getrimmter Wert garantiert nicht leer ist:
 * beliebiger Whitespace + ein nicht-leerer Kern (ohne führende/abschliessende
 * Leerzeichen) + beliebiger Whitespace. Damit ist `value.trim()` nicht leer und
 * kann als Teilstring in `user` geprüft werden (leere Felder deckt Property 8 ab).
 */
const whitespace = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { maxLength: 5 })
  .map((chars) => chars.join(""));

const nonEmptyTrimmedInput = fc
  .tuple(whitespace, fc.string({ minLength: 1 }), whitespace)
  .map(([lead, core, trail]) => `${lead}${core.trim() === "" ? "x" : core}${trail}`)
  .filter((s) => s.trim() !== "");

describe("buildRevisePrompt", () => {
  it("Property 7: user enthält getrimmten journalText und anweisung verbatim", () => {
    fc.assert(
      fc.property(
        nonEmptyTrimmedInput,
        nonEmptyTrimmedInput,
        (journalText, anweisung) => {
          const { system, user } = buildRevisePrompt({
            mode: "revise",
            journalText,
            anweisung,
          });

          expect(system.length).toBeGreaterThan(0);
          expect(user.length).toBeGreaterThan(0);
          expect(user.includes(journalText.trim())).toBe(true);
          expect(user.includes(anweisung.trim())).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
