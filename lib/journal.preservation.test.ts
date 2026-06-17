import { describe, it, expect } from "vitest";

import {
  composeJournal,
  displayedJournal,
  hasManualOverride,
  withJournalText,
} from "@/lib/journal";
import type { WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

// Feature: journal-update-after-edit-fix
// Property 2: Preservation A – Anzeige ohne Override und bewusste Gesamtbearbeitung
// Validates: Requirements 3.1, 3.2
//
// Baseline (Observation-first): Dieser Check beschreibt das Verhalten auf dem
// UNGEFIXTEN Code und MUSS bestehen. Nach dem Fix (Task 4.7) muss er weiterhin
// bestehen – der Fix verwirft den Override nur an den Feld-Commit-Punkten in
// app/page.tsx (generateDay/generateReflection/setDayText/setReflexion), nicht
// bei bewusster Gesamtbearbeitung (withJournalText/reviseJournal).
//
// Die UI-State-Übergänge (generateDay/generateReflection/setDayText/setReflexion
// in app/page.tsx) werden gemäss Spec manuell im Browser geprüft. Hier werden
// die reinen Funktionsteile abgesichert.

/** Baut eine Woche mit den fünf Tagen (Mo–Fr) aus den gegebenen Texten. */
function makeWeek(
  texts: Partial<Record<WeekJournal["days"][number]["weekday"], string>>,
  overrides: Partial<WeekJournal> = {},
): WeekJournal {
  return {
    id: "w-test",
    kw: 12,
    jahr: 2025,
    days: WEEKDAYS.map(({ key }) => ({
      weekday: key,
      stichworte: "",
      text: texts[key] ?? "",
    })),
    reflexion: "",
    updatedAt: new Date("2025-03-17T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("Preservation A – displayedJournal ohne/mit Override (Baseline, ungefixt)", () => {
  // 3.1 – ohne Override wird die Anzeige aus den Feldern abgeleitet.
  it("3.1: ohne Override gilt displayedJournal(week) == composeJournal(week)", () => {
    const cases: WeekJournal[] = [
      // leere Woche (nur Header/Platzhalter)
      makeWeek({}),
      // mit Tagesabsätzen
      makeWeek({ montag: "CI-Pipeline aufgesetzt", mittwoch: "Login-Bug behoben" }),
      // mit Tagesabsätzen und Reflexion
      makeWeek(
        { montag: "Deployment automatisiert" },
        { reflexion: "**Was ist mir in dieser Woche gut gelungen?**\n- Automatisierung" },
      ),
      // journalText explizit leer/whitespace → kein Override
      makeWeek({ dienstag: "Tests geschrieben" }, { journalText: "   \n  " }),
    ];

    for (const week of cases) {
      expect(hasManualOverride(week)).toBe(false);
      expect(displayedJournal(week)).toBe(composeJournal(week));
    }
  });

  // 3.2 – bewusste Gesamtbearbeitung setzt einen anzeigbaren Override.
  it("3.2: nach withJournalText(...) ist hasManualOverride true und die Anzeige zeigt den gesetzten journalText", () => {
    const basis = makeWeek({ montag: "CI-Pipeline aufgesetzt" });
    const eigenerText =
      "**Arbeitsjournal – KW 12 / 2025**\nLernender: Timo\n\n(manuell überarbeitet)";

    const week = withJournalText(basis, eigenerText);

    expect(hasManualOverride(week)).toBe(true);
    expect(week.journalText).toBe(eigenerText);
    expect(displayedJournal(week)).toBe(eigenerText);
    // Der Override hat Vorrang vor dem abgeleiteten Text.
    expect(displayedJournal(week)).not.toBe(composeJournal(week));
  });

  // 3.2 (Edge) – whitespace-only Editor-Wert setzt KEINEN Override.
  it("3.2 (edge): whitespace-only Wert entfernt den Override → Anzeige bleibt abgeleitet", () => {
    const basis = makeWeek({ montag: "CI-Pipeline aufgesetzt" });
    const week = withJournalText(basis, "   \n\t ");

    expect(hasManualOverride(week)).toBe(false);
    expect(displayedJournal(week)).toBe(composeJournal(week));
  });
});
