import type { WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

const HEADER_LERNENDER = "Lernender: Timo";
const HEADER_BETRIEB = "Betrieb: Appbakery / SBB, Bern";
const HEADER_AUSBILDUNG = "Ausbildungsjahr: 3. Lehrjahr";

/**
 * Setzt aus einer Woche den vollständigen Journaltext zusammen:
 * Header → Tagesabsätze (Mo–Fr, leere Tage mit Platzhalter "–") → Reflexion.
 * Der Reflexionsblock wird weggelassen, solange er leer ist.
 */
export function composeJournal(week: WeekJournal): string {
  const teile: string[] = [];

  teile.push(
    `**Arbeitsjournal – KW ${week.kw} / ${week.jahr}**\n` +
      `${HEADER_LERNENDER}\n` +
      `${HEADER_BETRIEB}\n` +
      `${HEADER_AUSBILDUNG}`,
  );

  const tageZeilen = WEEKDAYS.map(({ key, label }) => {
    const eintrag = week.days.find((d) => d.weekday === key);
    const text = eintrag?.text.trim();
    return `${label}: ${text ? text : "–"}`;
  }).join("\n");

  teile.push(`**Was habe ich diese Woche gemacht?**\n${tageZeilen}`);

  const reflexion = week.reflexion.trim();
  if (reflexion) {
    teile.push(reflexion);
  }

  return teile.join("\n\n");
}
