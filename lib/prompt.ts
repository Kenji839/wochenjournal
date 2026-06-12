import type { GenerateRequest, Weekday } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

/** Anzeige-Label eines Wochentags (z. B. "Montag"). */
function weekdayLabel(weekday: Weekday): string {
  return WEEKDAYS.find((w) => w.key === weekday)?.label ?? weekday;
}

/** Gemeinsame Stil- und Inhaltsregeln für beide Prompts. */
const REGELN = `Regeln:
- Schreibe auf Schweizer Hochdeutsch: niemals "ß", immer "ss".
- Professioneller, sachlicher Ton, aber nicht übertrieben formell.
- Erfinde KEINE Details – nutze ausschliesslich die angegebenen Informationen.
- Antworte NUR mit dem geforderten Inhalt, ohne Einleitung, Kommentar oder Erklärung.`;

/**
 * System-Prompt für einen einzelnen Arbeitstag.
 * Liefert genau einen Fliesstext-Absatz ohne Wochentags-Präfix und ohne
 * Aufzählungszeichen (das Präfix "Montag:" wird beim Zusammensetzen ergänzt).
 */
export const SYSTEM_PROMPT_DAY = `Du bist ein Assistent für Lernende im dualen Bildungssystem der Schweiz.
Aus kurzen Stichworten zu einem einzelnen Arbeitstag formulierst du einen kurzen, professionellen Absatz für ein Arbeitsjournal.

Anforderungen an die Ausgabe:
- Genau EIN zusammenhängender Absatz in Fliesstext (2–4 Sätze).
- KEIN Wochentag und KEIN Doppelpunkt am Anfang – nur der Absatztext.
- Keine Aufzählung, keine Überschrift, keine Bullet Points.

${REGELN}`;

/**
 * System-Prompt für die Wochen-Reflexion.
 * Liefert genau vier Abschnitte mit exakt diesen Überschriften, jeweils als
 * Aufzählung. Falls Kontext aus Vorwochen vorhanden ist, werden Fortschritte
 * gegenüber den Vorwochen benannt.
 */
export const SYSTEM_PROMPT_REFLECTION = `Du bist ein Assistent für Lernende im dualen Bildungssystem der Schweiz.
Aus den Tagesabsätzen einer Arbeitswoche erstellst du eine reflektierte Wochenauswertung.

Die Ausgabe besteht aus GENAU diesen vier Abschnitten, in dieser Reihenfolge, jeweils mit der exakten Überschrift und darunter einer Aufzählung mit "- ":

**Was ist mir in dieser Woche gut gelungen?**
**Probleme / Herausforderungen**
**Was kann ich besser machen in Zukunft?**
**Was habe ich diese Woche neu gelernt?**

Inhaltliche Vorgaben:
- Stütze dich ausschliesslich auf die Tagesabsätze dieser Woche.
- Wenn Kontext aus früheren Wochen mitgegeben wird, nutze ihn NUR, um erkennbare Fortschritte gegenüber den Vorwochen zu benennen (vor allem in "Was ist mir in dieser Woche gut gelungen?" und "Was kann ich besser machen in Zukunft?"). Erfinde keine Details über frühere Wochen.
- Pro Abschnitt 2–5 Aufzählungspunkte, reflektierend formuliert.

${REGELN}`;

/** Baut System- und User-Prompt für die Generierung eines Tagesabsatzes. */
export function buildDayPrompt(
  req: Extract<GenerateRequest, { mode: "day" }>,
): { system: string; user: string } {
  const user = `Wochentag: ${weekdayLabel(req.weekday)}

Stichworte:
${req.stichworte.trim()}`;

  return { system: SYSTEM_PROMPT_DAY, user };
}

/** Baut System- und User-Prompt für die Generierung der Wochen-Reflexion. */
export function buildReflectionPrompt(
  req: Extract<GenerateRequest, { mode: "reflection" }>,
): { system: string; user: string } {
  const tagesabsaetze = req.days
    .filter((d) => d.text.trim() !== "")
    .map((d) => `${weekdayLabel(d.weekday)}: ${d.text.trim()}`)
    .join("\n\n");

  let user = `Tagesabsätze dieser Woche (KW ${req.kw} / ${req.jahr}):

${tagesabsaetze}`;

  if (req.previousWeeks.length > 0) {
    const kontext = req.previousWeeks
      .map(
        (w) =>
          `Reflexion KW ${w.kw} / ${w.jahr}:
${w.reflexion.trim()}`,
      )
      .join("\n\n");

    user += `

---
Kontext frühere Wochen (nur zum Ableiten von Fortschritten, nicht wiederholen):

${kontext}`;
  }

  return { system: SYSTEM_PROMPT_REFLECTION, user };
}
