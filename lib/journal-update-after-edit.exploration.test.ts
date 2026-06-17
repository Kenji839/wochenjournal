import { describe, it, expect } from "vitest";

import { composeJournal, displayedJournal, withoutJournalText } from "@/lib/journal";
import type { WeekJournal } from "@/types/journal";

/**
 * Bugfix-Spec: journal-update-after-edit-fix – Property 1 (EXPLORATION).
 *
 * Property 1: Expected Behavior A – ein Feld-Update hebt die veraltete
 * Gesamtjournal-Anzeige auf.
 *
 * DERSELBE Check wie in Task 1 (Bug Condition A). Nach dem Defekt-A-Fix
 * (Task 4.3) verwirft `app/page.tsx` den Override an den Feld-Commit-Punkten
 * via `withoutJournalText(...)`. Die Modellierung des Post-Commit-Zustands
 * spiegelt jetzt diesen gefixten Commit-Pfad: das geänderte Feld
 * (`days[i].text` bzw. `reflexion`) wird aktualisiert UND der `journalText`-
 * Override wird am Commit-Punkt verworfen. Die Assertion bleibt identisch zur
 * Expected Behavior aus Property 1: nach dem Feld-Update soll
 * `displayedJournal(week') == composeJournal(week')` gelten und das Feld-Update
 * enthalten.
 *
 * EXPECTED OUTCOME: Dieser Check BESTEHT (Defekt A behoben).
 *
 * Validates: Requirements 2.1, 2.2
 */

/** Basiswoche mit einem gesetzten (veralteten) manuellen Override. */
function weekMitOverride(overrideText: string): WeekJournal {
  return {
    id: "exploration-week",
    kw: 14,
    jahr: 2025,
    days: [
      { weekday: "montag", stichworte: "alt", text: "Alter Montag-Absatz." },
      { weekday: "dienstag", stichworte: "", text: "" },
      { weekday: "mittwoch", stichworte: "", text: "" },
      { weekday: "donnerstag", stichworte: "", text: "" },
      { weekday: "freitag", stichworte: "", text: "" },
    ],
    reflexion: "",
    journalText: overrideText,
    updatedAt: new Date("2025-04-01T00:00:00.000Z").toISOString(),
  };
}

describe("Bug Condition A – veraltete Journal-Anzeige nach Feld-Update (EXPLORATION)", () => {
  it("Tag generiert: nach neuem Montag-Absatz zeigt displayedJournal den abgeleiteten Text inkl. Update", () => {
    const week = weekMitOverride(
      "**Arbeitsjournal – KW 14 / 2025**\nEingefrorener, veralteter Override-Text.",
    );

    // Feld-Commit wie im gefixten Code: days[0].text aktualisiert,
    // Override am Commit-Punkt via withoutJournalText verworfen.
    const neuerMontag = "Neu generierter Montag-Absatz mit aktuellem Inhalt.";
    const week2: WeekJournal = withoutJournalText({
      ...week,
      days: week.days.map((d) =>
        d.weekday === "montag" ? { ...d, text: neuerMontag } : d,
      ),
    });

    // Expected Behavior (Property 1): Anzeige folgt dem abgeleiteten Text und
    // enthält das Feld-Update.
    expect(displayedJournal(week2)).toBe(composeJournal(week2));
    expect(displayedJournal(week2)).toContain(neuerMontag);
  });

  it("Tag bearbeitet: nach manueller Dienstag-Änderung zeigt displayedJournal das Update", () => {
    const week = weekMitOverride("Eingefrorener Override ohne den neuen Dienstag.");

    const neuerDienstag = "Manuell bearbeiteter Dienstag-Absatz.";
    const week2: WeekJournal = withoutJournalText({
      ...week,
      days: week.days.map((d) =>
        d.weekday === "dienstag" ? { ...d, text: neuerDienstag } : d,
      ),
    });

    expect(displayedJournal(week2)).toBe(composeJournal(week2));
    expect(displayedJournal(week2)).toContain(neuerDienstag);
  });

  it("Reflexion generiert: nach neuer Reflexion zeigt displayedJournal das Update", () => {
    const week = weekMitOverride("Eingefrorener Override ohne die neue Reflexion.");

    const neueReflexion =
      "**Was ist mir in dieser Woche gut gelungen?**\n- Neu generierte Reflexion.";
    const week2: WeekJournal = withoutJournalText({ ...week, reflexion: neueReflexion });

    expect(displayedJournal(week2)).toBe(composeJournal(week2));
    expect(displayedJournal(week2)).toContain(neueReflexion);
  });
});
