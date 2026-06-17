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

Inhaltliche Vorgaben:
- Inhaltliche Grundlage des Absatzes sind ausschliesslich die Stichworte des aktuellen Tages.
- Wenn Kontext aus der Vorwoche mitgegeben wird, nutze ihn NUR für einen stimmigen inhaltlichen Anschluss und Übergang sowie zur Vermeidung von Wiederholungen. Erfinde keine Details aus der Vorwoche und wiederhole sie nicht wörtlich; gib den Vorwochen-Kontext nicht als Inhalt des aktuellen Tagesabsatzes wieder.

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
- Wenn eine bestehende Reflexion mitgegeben wird, dient sie als Ausgangsbasis: übernimm bereits vorhandene manuelle Anpassungen und beziehe neue Tage ein, ohne Details zu erfinden, die exakten vier Überschriften beizubehalten und auf Schweizer Hochdeutsch zu bleiben (kein "ß", immer "ss").
- Pro Abschnitt 2–5 Aufzählungspunkte, reflektierend formuliert.

${REGELN}`;

/**
 * System-Prompt für die Überarbeitung des gesamten Journals.
 * Behält das feste Journalformat exakt bei und wendet die Anweisung des Nutzers
 * auf das gesamte Journal an; gibt ausschliesslich den überarbeiteten Journaltext
 * zurück.
 */
export const SYSTEM_PROMPT_REVISE = `Du bist ein Assistent für Lernende im dualen Bildungssystem der Schweiz.
Du überarbeitest ein bereits fertig zusammengesetztes Arbeitsjournal gemäss einer Anweisung des Nutzers.

Anforderungen an die Ausgabe:
- Behalte das feste Journalformat exakt bei: die Kopfzeilen (Arbeitsjournal – KW … / Lernender / Betrieb / Ausbildungsjahr), den Abschnitt "**Was habe ich diese Woche gemacht?**" mit den Tageszeilen Montag–Freitag sowie die vier Reflexions-Überschriften in genau dieser Reihenfolge:
  **Was ist mir in dieser Woche gut gelungen?**
  **Probleme / Herausforderungen**
  **Was kann ich besser machen in Zukunft?**
  **Was habe ich diese Woche neu gelernt?**
- Wende die Anweisung auf das gesamte Journal an und lass alle von der Anweisung nicht betroffenen Teile unverändert.
- Gib als Antwort AUSSCHLIESSLICH den überarbeiteten, vollständigen Journaltext zurück – ohne Einleitung, Kommentar oder Erklärung.

${REGELN}`;

/** Baut System- und User-Prompt für die Generierung eines Tagesabsatzes. */
export function buildDayPrompt(
  req: Extract<GenerateRequest, { mode: "day" }>,
): { system: string; user: string } {
  let user = `Wochentag: ${weekdayLabel(req.weekday)}

Stichworte:
${req.stichworte.trim()}`;

  const kontextTage = req.previousWeekDays.filter((d) => d.text.trim() !== "");
  if (kontextTage.length > 0) {
    const kontext = kontextTage
      .map((d) => `${weekdayLabel(d.weekday)}: ${d.text.trim()}`)
      .join("\n\n");

    user += `

---
Kontext Vorwoche (nur für Anschluss/Übergang, nicht wiederholen oder erfinden):

${kontext}`;
  }

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

  if (req.aktuelleReflexion?.trim()) {
    user += `

---
Bestehende Reflexion (als Ausgangsbasis, manuelle Anpassungen erhalten, neue Tage einbeziehen):

${req.aktuelleReflexion.trim()}`;
  }

  return { system: SYSTEM_PROMPT_REFLECTION, user };
}

/** Baut System- und User-Prompt für die Überarbeitung des Gesamtjournals. */
export function buildRevisePrompt(
  req: Extract<GenerateRequest, { mode: "revise" }>,
): { system: string; user: string } {
  const user = `Aktuelles Gesamtjournal:

${req.journalText.trim()}

---
Anweisung zur Überarbeitung:
${req.anweisung.trim()}`;

  return { system: SYSTEM_PROMPT_REVISE, user };
}
