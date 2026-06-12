// Geteilte Typen für den Wochenjournal-Generator.
// Quelle der Wahrheit für API-Request/-Response und Persistenz.

export type Weekday =
  | "montag"
  | "dienstag"
  | "mittwoch"
  | "donnerstag"
  | "freitag";

/** Feste Reihenfolge der Wochentage mit Anzeige-Label. */
export const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "montag", label: "Montag" },
  { key: "dienstag", label: "Dienstag" },
  { key: "mittwoch", label: "Mittwoch" },
  { key: "donnerstag", label: "Donnerstag" },
  { key: "freitag", label: "Freitag" },
];

/** Ein einzelner Wochentag: rohe Stichworte und generierter/editierter Absatz. */
export interface DayEntry {
  weekday: Weekday;
  stichworte: string;
  text: string;
}

/** Alle Daten einer Kalenderwoche. */
export interface WeekJournal {
  id: string;
  kw: number;
  jahr: number;
  /** Genau fünf Einträge (Mo–Fr) in der Reihenfolge von WEEKDAYS. */
  days: DayEntry[];
  /** Generierter Reflexionsblock mit den vier Abschnitten. */
  reflexion: string;
  /** ISO-String der letzten Änderung. */
  updatedAt: string;
}

/** Request an POST /api/generate, per "mode" unterschieden. */
export type GenerateRequest =
  | {
      mode: "day";
      weekday: Weekday;
      stichworte: string;
    }
  | {
      mode: "reflection";
      kw: number;
      jahr: number;
      days: { weekday: Weekday; text: string }[];
      /**
       * Kontext der bis zu drei direkt vorangegangenen Wochen (älteste zuerst),
       * nur Wochen mit nicht-leerer Reflexion.
       */
      previousWeeks: { kw: number; jahr: number; reflexion: string }[];
    };
