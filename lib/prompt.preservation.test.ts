import { describe, it, expect } from "vitest";

import {
  buildDayPrompt,
  buildReflectionPrompt,
  SYSTEM_PROMPT_DAY,
  SYSTEM_PROMPT_REFLECTION,
} from "@/lib/prompt";
import type { GenerateRequest } from "@/types/journal";

// Feature: journal-update-after-edit-fix
// Property 4: Preservation B – Reflexions-Erstgenerierung ohne bestehende Reflexion
// Validates: Requirements 3.3 (sowie 3.4 für die Tagesabsatz-Umsetzung)
//
// Baseline (Observation-first): Dieser Check hält das Verhalten von
// buildReflectionPrompt auf dem UNGEFIXTEN Code fest und MUSS bestehen. Da der
// aktuelle Request (mode "reflection") KEIN Feld für eine bestehende Reflexion
// trägt, enthält der erzeugte Prompt niemals einen Kontextblock für eine
// bestehende Reflexion. Nach dem Fix (Task 4.7) muss dieser Check unverändert
// bestehen: fehlt/leer ist `aktuelleReflexion`, bleibt der Prompt identisch.

/** Marker, den der spätere Fix für den Kontextblock der bestehenden Reflexion verwendet. */
const BESTEHENDE_REFLEXION_MARKER = "Bestehende Reflexion";

type ReflectionRequest = Extract<GenerateRequest, { mode: "reflection" }>;

describe("Preservation B – buildReflectionPrompt ohne bestehende Reflexion (Baseline, ungefixt)", () => {
  // 3.3 – Erstgenerierung ohne Vorwochen: exakt der bisherige Prompt.
  it("3.3: ohne previousWeeks erzeugt buildReflectionPrompt den bekannten Prompt ohne Kontextblock", () => {
    const req: ReflectionRequest = {
      mode: "reflection",
      kw: 10,
      jahr: 2025,
      days: [
        { weekday: "montag", text: "Setup CI" },
        { weekday: "dienstag", text: "" },
        { weekday: "mittwoch", text: "Bugfix Login" },
      ],
      previousWeeks: [],
    };

    const { system, user } = buildReflectionPrompt(req);

    expect(system).toBe(SYSTEM_PROMPT_REFLECTION);
    expect(user).toBe(
      "Tagesabsätze dieser Woche (KW 10 / 2025):\n\n" +
        "Montag: Setup CI\n\n" +
        "Mittwoch: Bugfix Login",
    );
    // Kein Kontextblock für frühere Wochen ...
    expect(user).not.toContain("Kontext frühere Wochen");
    // ... und kein Kontextblock für eine bestehende Reflexion.
    expect(user).not.toContain(BESTEHENDE_REFLEXION_MARKER);
  });

  // 3.3 – Erstgenerierung mit Kontext der bis zu drei Vorwochen: exakt der bisherige Prompt.
  it("3.3: mit bis zu drei previousWeeks bleibt der previousWeeks-Kontext enthalten, ohne Kontextblock für eine bestehende Reflexion", () => {
    const req: ReflectionRequest = {
      mode: "reflection",
      kw: 10,
      jahr: 2025,
      days: [{ weekday: "montag", text: "Deployment automatisiert" }],
      previousWeeks: [
        { kw: 7, jahr: 2025, reflexion: "Reflexion A" },
        { kw: 8, jahr: 2025, reflexion: "Reflexion B" },
        { kw: 9, jahr: 2025, reflexion: "Reflexion C" },
      ],
    };

    const { system, user } = buildReflectionPrompt(req);

    expect(system).toBe(SYSTEM_PROMPT_REFLECTION);
    expect(user).toBe(
      "Tagesabsätze dieser Woche (KW 10 / 2025):\n\n" +
        "Montag: Deployment automatisiert\n\n" +
        "---\n" +
        "Kontext frühere Wochen (nur zum Ableiten von Fortschritten, nicht wiederholen):\n\n" +
        "Reflexion KW 7 / 2025:\nReflexion A\n\n" +
        "Reflexion KW 8 / 2025:\nReflexion B\n\n" +
        "Reflexion KW 9 / 2025:\nReflexion C",
    );
    // Der previousWeeks-Kontext ist vorhanden ...
    expect(user).toContain("Kontext frühere Wochen");
    // ... aber kein Kontextblock für eine bestehende Reflexion.
    expect(user).not.toContain(BESTEHENDE_REFLEXION_MARKER);
  });

  // 3.4 – Tagesabsatz-Umsetzung: buildDayPrompt übernimmt die Stichworte unverändert (getrimmt).
  it("3.4: buildDayPrompt setzt die Tagesstichworte unverändert in den User-Prompt", () => {
    const req: Extract<GenerateRequest, { mode: "day" }> = {
      mode: "day",
      weekday: "montag",
      stichworte: "  CI-Pipeline aufgesetzt, Code-Review  ",
      previousWeekDays: [],
    };

    const { system, user } = buildDayPrompt(req);

    expect(system).toBe(SYSTEM_PROMPT_DAY);
    expect(user).toBe(
      "Wochentag: Montag\n\nStichworte:\nCI-Pipeline aufgesetzt, Code-Review",
    );
  });
});
