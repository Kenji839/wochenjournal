import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Gemini-SDK über lib/ai mocken, damit der echte SDK nie geladen/aufgerufen
// wird. `streamCompletion` ist ein Spy; `isQuotaError` bleibt ein Passthrough.
// `vi.hoisted`, weil `vi.mock` an den Dateianfang gehoben wird und der Spy daher
// vor der Mock-Factory initialisiert sein muss.
const { streamCompletionSpy } = vi.hoisted(() => ({
  streamCompletionSpy: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  streamCompletion: streamCompletionSpy,
  isQuotaError: (err: unknown): boolean => {
    if (typeof err !== "object" || err === null) return false;
    return (err as { status?: unknown }).status === 429;
  },
}));

import { POST } from "@/app/api/generate/route";

const RUNS = 100;

/** Arbitrary für eine nach Trim leere Zeichenkette (Whitespace oder ""). */
const emptyAfterTrimArbitrary: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"))
  .map((parts) => parts.join(""));

/** Arbitrary für eine nach Trim nicht-leere Zeichenkette. */
const nonEmptyAfterTrimArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim() !== "");

/** Baut einen revise-POST-Request mit den gegebenen Feldern. */
function reviseRequest(journalText: string, anweisung: string): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "revise", journalText, anweisung }),
  });
}

describe("POST /api/generate – revise-Validierung", () => {
  beforeEach(() => {
    streamCompletionSpy.mockReset();
  });

  // Feature: journal-redesign-edit, Property 8
  // Validates: Requirements 5.3
  it("antwortet mit 400, benennt das fehlende Feld und ruft Gemini nicht auf, wenn journalText ODER anweisung nach Trim leer ist", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Fall 1: journalText leer, anweisung nicht-leer
          fc.record({
            journalText: emptyAfterTrimArbitrary,
            anweisung: nonEmptyAfterTrimArbitrary,
          }),
          // Fall 2: journalText nicht-leer, anweisung leer
          fc.record({
            journalText: nonEmptyAfterTrimArbitrary,
            anweisung: emptyAfterTrimArbitrary,
          }),
          // Fall 3: beide leer
          fc.record({
            journalText: emptyAfterTrimArbitrary,
            anweisung: emptyAfterTrimArbitrary,
          }),
        ),
        async ({ journalText, anweisung }) => {
          streamCompletionSpy.mockReset();

          const res = await POST(reviseRequest(journalText, anweisung));
          const text = await res.text();

          expect(res.status).toBe(400);

          // journalText wird zuerst geprüft: ist er leer, wird "Gesamtjournal"
          // benannt; sonst (journalText vorhanden, anweisung leer) "Anweisung".
          if (journalText.trim() === "") {
            expect(text).toContain("Gesamtjournal");
          } else {
            expect(text).toContain("Anweisung");
          }

          // Gemini darf bei Validierungsfehlern nie aufgerufen werden.
          expect(streamCompletionSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: RUNS },
    );
  });
});
