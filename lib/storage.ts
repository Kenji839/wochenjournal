import type { WeekJournal } from "@/types/journal";

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

/** Schreibt die Wochenliste zurück; Fehler (z. B. Quota) werden still ignoriert. */
function persist(weeks: WeekJournal[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(weeks));
  } catch {
    // Speicher nicht verfügbar / voll – App bleibt nutzbar.
  }
}

/**
 * Fügt eine Woche ein oder aktualisiert die bestehende (gleiche id), setzt
 * updatedAt, sortiert nach updatedAt absteigend und begrenzt auf MAX_WEEKS.
 * Gibt die aktualisierte Liste zurück.
 */
export function saveWeek(week: WeekJournal): WeekJournal[] {
  const updated: WeekJournal = { ...week, updatedAt: new Date().toISOString() };
  const ohneAlte = loadWeeks().filter((w) => w.id !== updated.id);
  const weeks = [updated, ...ohneAlte]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_WEEKS);
  persist(weeks);
  return weeks;
}

/** Entfernt eine Woche anhand der id und gibt die aktualisierte Liste zurück. */
export function deleteWeek(id: string): WeekJournal[] {
  const weeks = loadWeeks().filter((w) => w.id !== id);
  persist(weeks);
  return weeks;
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
