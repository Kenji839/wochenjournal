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

/** True, wenn eine nicht-leere manuelle Überschreibung vorliegt. */
export function hasManualOverride(week: WeekJournal): boolean {
  return typeof week.journalText === "string" && week.journalText.trim() !== "";
}

/**
 * Der aktuell anzuzeigende Gesamtjournal-Text: die Überschreibung, falls
 * vorhanden, sonst der aus den Feldern abgeleitete Text. Einzige Quelle für
 * Vorschau, Editor, Kopieren und Download.
 */
export function displayedJournal(week: WeekJournal): string {
  return hasManualOverride(week) ? week.journalText! : composeJournal(week);
}

/**
 * Setzt eine manuelle Überschreibung aus dem Editor-Wert. Besteht der Wert nach
 * Trim nur aus Leerzeichen, wird die Überschreibung entfernt (zurück zum
 * abgeleiteten Text). Der Wert wird sonst unverändert (inkl. Whitespace) abgelegt.
 */
export function withJournalText(week: WeekJournal, value: string): WeekJournal {
  if (value.trim() === "") return withoutJournalText(week);
  return { ...week, journalText: value };
}

/** Entfernt die manuelle Überschreibung (Neu-Zusammensetzen aus den Feldern). */
export function withoutJournalText(week: WeekJournal): WeekJournal {
  if (week.journalText === undefined) return week;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { journalText: _drop, ...rest } = week;
  return rest;
}

/**
 * Prüft, ob die Woche ausser Header/Platzhaltern keinen Inhalt hat
 * (keine Überschreibung, kein Tagesabsatz, keine Reflexion). Für die
 * Leer-Prüfung von Export und KI-Überarbeitung.
 */
export function istInhaltsleer(week: WeekJournal): boolean {
  return (
    !hasManualOverride(week) &&
    !week.days.some((d) => d.text.trim() !== "") &&
    week.reflexion.trim() === ""
  );
}

/**
 * Dateiname für den Download: KW zweistellig mit führender Null,
 * Jahr vierstellig: arbeitsjournal-kw{KW}-{JAHR}.txt
 */
export function journalFileName(week: WeekJournal): string {
  const kw = String(week.kw).padStart(2, "0");
  const jahr = String(week.jahr).padStart(4, "0");
  return `arbeitsjournal-kw${kw}-${jahr}.txt`;
}
