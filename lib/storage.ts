import type { Weekday, WeekJournal } from "@/types/journal";

const STORAGE_KEY = "wochenjournal_weeks";
const MAX_WEEKS = 10;

/** Liefert true, wenn localStorage verfügbar ist (Client-Umgebung). */
function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Lädt alle gespeicherten Wochen; gibt bei Fehlern/SSR eine leere Liste zurück. */
export function loadWeeks(): WeekJournal[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WeekJournal[]) : [];
  } catch {
    return [];
  }
}

/** Schreibt die Wochenliste zurück; true bei Erfolg, false bei Fehler (z. B. Quota/SSR). */
function persist(weeks: WeekJournal[]): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(weeks));
    return true;
  } catch {
    // Speicher nicht verfügbar / voll – App bleibt nutzbar.
    return false;
  }
}

/**
 * Fügt eine Woche ein oder aktualisiert die bestehende (gleiche id), setzt
 * updatedAt, sortiert nach updatedAt absteigend und begrenzt auf MAX_WEEKS.
 * Gibt zusätzlich zurück, ob der Schreibvorgang gelang. Bei einem Schreibfehler
 * (z. B. Quota) bleibt der zuvor gespeicherte Stand unverändert (Rollback) und
 * die unveränderte Vorliste wird mit `persisted: false` zurückgegeben.
 */
export function saveWeekChecked(week: WeekJournal): {
  weeks: WeekJournal[];
  persisted: boolean;
} {
  const vorher = loadWeeks();
  const updated: WeekJournal = { ...week, updatedAt: new Date().toISOString() };
  const weeks = [updated, ...vorher.filter((w) => w.id !== updated.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_WEEKS);
  // Bei Schreibfehler bleibt der zuvor gespeicherte Zustand unverändert.
  const persisted = persist(weeks);
  return persisted ? { weeks, persisted } : { weeks: vorher, persisted };
}

/**
 * Fügt eine Woche ein oder aktualisiert die bestehende (gleiche id), setzt
 * updatedAt, sortiert nach updatedAt absteigend und begrenzt auf MAX_WEEKS.
 * Gibt die aktualisierte Liste zurück. Bei einem Schreibfehler bleibt der zuvor
 * gespeicherte Stand unverändert und wird zurückgegeben.
 */
export function saveWeek(week: WeekJournal): WeekJournal[] {
  return saveWeekChecked(week).weeks;
}

/**
 * Entfernt eine Woche anhand der id und gibt die aktualisierte Liste zurück.
 * Bei einem Schreibfehler bleibt der zuvor gespeicherte Stand unverändert.
 */
export function deleteWeek(id: string): WeekJournal[] {
  const vorher = loadWeeks();
  const weeks = vorher.filter((w) => w.id !== id);
  return persist(weeks) ? weeks : vorher;
}

/** Sucht die Woche zu einer KW/Jahr-Kombination. */
export function findWeek(
  weeks: WeekJournal[],
  kw: number,
  jahr: number,
): WeekJournal | undefined {
  return weeks.find((w) => w.kw === kw && w.jahr === jahr);
}

/**
 * Liefert die bis zu `limit` chronologisch direkt vor (kw/jahr) liegenden Wochen
 * mit nicht-leerer Reflexion – als Kontext für die Reflexionsgenerierung.
 * Älteste zuerst.
 */
export function previousWeeks(
  weeks: WeekJournal[],
  kw: number,
  jahr: number,
  limit = 3,
): WeekJournal[] {
  const rang = (w: { kw: number; jahr: number }) => w.jahr * 100 + w.kw;
  const grenze = jahr * 100 + kw;

  return weeks
    .filter((w) => rang(w) < grenze && w.reflexion.trim() !== "")
    .sort((a, b) => rang(a) - rang(b)) // aufsteigend = älteste zuerst
    .slice(-limit);
}

/**
 * Liefert die Tagesabsätze (Mo–Fr) der chronologisch unmittelbar vor (kw/jahr)
 * liegenden gespeicherten Woche mit nicht-leerem Text – als Kontext für die
 * Tagesgenerierung. Reihenfolge: Montag bis Freitag. Existiert keine solche
 * Vorwoche oder enthält sie keine nicht-leeren Tagesabsätze, wird eine leere
 * Liste zurückgegeben.
 */
export function previousWeekDays(
  weeks: WeekJournal[],
  kw: number,
  jahr: number,
): { weekday: Weekday; text: string }[] {
  const rang = (w: { kw: number; jahr: number }) => w.jahr * 100 + w.kw;
  const grenze = jahr * 100 + kw;

  // Genau die eine Woche mit grösstem Rang unterhalb der Grenze (kleinste
  // chronologische Differenz, nie die aktuelle Woche selbst).
  const vorwoche = weeks
    .filter((w) => rang(w) < grenze)
    .sort((a, b) => rang(b) - rang(a))[0]; // absteigend = nächste zuerst

  if (!vorwoche) return [];

  // Nicht-leere Tagesabsätze in der bestehenden days-Reihenfolge (Mo–Fr).
  return vorwoche.days
    .filter((d) => d.text.trim() !== "")
    .map((d) => ({ weekday: d.weekday, text: d.text }));
}
