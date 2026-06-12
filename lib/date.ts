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
