import { describe, it, expect } from "vitest";
import { buildReflectionPrompt } from "@/lib/prompt";
import type { GenerateRequest } from "@/types/journal";

// Feature: journal-update-after-edit-fix, Property 3 (Bug Condition B)
//
// EXPLORATIONS-CHECK (VOR dem Fix) – Task 2.
// Dieser Check MUSS auf dem UNGEFIXTEN Code FEHLSCHLAGEN. Das Fehlschlagen
// bestätigt Defekt B: Wird die Reflexion neu generiert, obwohl bereits eine
// nicht-leere Reflexion existiert, fehlt im Request jedes Feld für die
// bestehende Reflexion. `buildReflectionPrompt` kann sie daher nicht als
// Kontextblock in den User-Prompt aufnehmen.
//
// Property 3 (Expected Behavior): `prompt.user` SHALL die bestehende Reflexion
// als abgegrenzten Kontextblock enthalten.
//
// Hinweis: Das geplante optionale Feld heisst `aktuelleReflexion` (Task 4.1
// ergänzt es in types/journal.ts). Auf ungefixtem Code existiert das Feld noch
// nicht, weshalb der Request es nicht tragen kann und der Kontextblock im Prompt
// fehlt. DO NOT FIX – das Fehlschlagen ist hier das erwartete Ergebnis.
// Validates: Requirements 1.3

describe("buildReflectionPrompt – Bug Condition B (bestehende Reflexion als Kontext)", () => {
  it("Property 3: prompt.user enthält die bestehende Reflexion als Kontextblock", () => {
    const aktuelleReflexion = `**Was ist mir in dieser Woche gut gelungen?**
- Ich habe die Streaming-Anbindung sauber umgesetzt.

**Probleme / Herausforderungen**
- Der Kontextwechsel zwischen Wochen war anfangs unklar.

**Was kann ich besser machen in Zukunft?**
- Frühzeitig Tests für reine Logik schreiben.

**Was habe ich diese Woche neu gelernt?**
- Den Umgang mit ReadableStream im Route Handler.`;

    // Reflexions-Request mit dem nun (nach dem Fix) existierenden Feld
    // `aktuelleReflexion`, das die bestehende Reflexion als Ausgangsbasis trägt.
    const req: Extract<GenerateRequest, { mode: "reflection" }> = {
      mode: "reflection",
      kw: 12,
      jahr: 2025,
      days: [
        { weekday: "montag", text: "Ein neuer Montag-Absatz mit frischem Inhalt." },
        { weekday: "dienstag", text: "Dienstag mit weiterem Fortschritt." },
      ],
      previousWeeks: [],
      aktuelleReflexion,
    };

    const { user } = buildReflectionPrompt(req);

    // Expected Behavior (Property 3): der User-Prompt soll die bestehende
    // Reflexion verbatim als Kontext enthalten. Auf ungefixtem Code ist das
    // nicht der Fall -> Assertion schlägt fehl (Bug bestätigt).
    expect(user.includes(aktuelleReflexion.trim())).toBe(true);
  });
});
