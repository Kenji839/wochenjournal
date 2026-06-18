import type { GitDay } from "@/types/journal";

/**
 * Berechnet die ISO-8601-Kalenderwoche und das zugehörige ISO-Jahr.
 *
 * ISO-Wochen beginnen am Montag; KW 1 ist die Woche mit dem ersten Donnerstag
 * des Jahres. Das ISO-Jahr kann am Jahreswechsel vom Kalenderjahr abweichen.
 */
export function getCurrentWeek(date: Date = new Date()): {
  kw: number;
  jahr: number;
} {
  // Auf UTC-Mitternacht normalisieren, um Zeitzonen-/DST-Effekte zu vermeiden.
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );

  // Auf den Donnerstag derselben ISO-Woche verschieben (Mo=1 … So=7).
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const kw = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return { kw, jahr: isoYear };
}

/**
 * Liefert die Daten Montag–Freitag der ISO-Kalenderwoche {kw}/{jahr}
 * als "YYYY-MM-DD"-Strings (UTC-stabil, ohne Zeitzoneneffekte), zusammen
 * mit dem zugehörigen englischen Wochentags-Schlüssel der API.
 *
 * Index 0 = Montag … Index 4 = Freitag.
 *
 * Berechnung analog zu getCurrentWeek über UTC-Mitternacht: KW 1 ist die Woche
 * mit dem ersten Donnerstag, also enthält der 4. Januar immer die KW 1. Vom
 * Montag dieser Woche aus werden (kw - 1) Wochen addiert, um den Montag der
 * Zielwoche zu bestimmen; daraus folgen Montag bis Freitag.
 */
export function isoWeekWorkdays(
  kw: number,
  jahr: number,
): { day: GitDay; date: string }[] {
  // Der 4. Januar liegt per ISO-Definition immer in der Kalenderwoche 1.
  const jan4 = new Date(Date.UTC(jahr, 0, 4));

  // Montag der KW 1 bestimmen (Mo=1 … So=7).
  const dayNum = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (dayNum - 1));

  // Montag der Zielwoche: (kw - 1) ganze Wochen weiter.
  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setUTCDate(mondayWeek1.getUTCDate() + (kw - 1) * 7);

  return GIT_DAYS.map((day, index) => {
    const d = new Date(mondayTarget);
    d.setUTCDate(mondayTarget.getUTCDate() + index);
    return { day, date: toIsoDate(d) };
  });
}

/** Wochentags-Schlüssel Montag–Freitag in fester Reihenfolge. */
const GIT_DAYS: GitDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

/** Formatiert ein Date UTC-stabil als "YYYY-MM-DD". */
function toIsoDate(date: Date): string {
  const jahr = date.getUTCFullYear().toString().padStart(4, "0");
  const monat = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const tag = date.getUTCDate().toString().padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}
