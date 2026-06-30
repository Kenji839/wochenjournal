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

/** Gemeinsame Basis aller Tagesanhänge. */
interface AttachmentBase {
  /** Stabile id (crypto.randomUUID) für Reihenfolge, Entfernen und Confluence-Dateinamen. */
  id: string;
}

/** Bild-Anhang: Base64-kodierte Rasterdaten + Originaldateiname + optionale Unterschrift. */
export interface ImageAttachment extends AttachmentBase {
  type: "image";
  /** Base64-kodierte Bilddaten (ohne Data-URL-Präfix). */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  /** Ursprünglicher Dateiname der ausgewählten Datei. */
  filename: string;
  /** Optionale Bildunterschrift (≤ 200 Zeichen). */
  caption?: string;
}

/** Code-Snippet: unveränderter Quelltext + optionale Sprachangabe. */
export interface CodeAttachment extends AttachmentBase {
  type: "code";
  /** Quelltext, unverändert (inkl. Zeilenumbrüchen/Einrückungen/umschliessender Leerzeichen). */
  source: string;
  /** Optionale Sprachangabe (≤ 30 Zeichen). */
  language?: string;
}

/** Link: URL + optionaler Anzeigetext. */
export interface LinkAttachment extends AttachmentBase {
  type: "link";
  /** Mit http:// oder https:// beginnende URL (≤ 2048 Zeichen). */
  url: string;
  /** Optionaler Anzeigetext (≤ 200 Zeichen); fehlt er, gilt die URL als Anzeigetext. */
  displayText?: string;
}

/** Diskriminierte Union aller Anhangtypen (über das Feld `type`). */
export type Attachment = ImageAttachment | CodeAttachment | LinkAttachment;

/** Ein einzelner Wochentag: rohe Stichworte und generierter/editierter Absatz. */
export interface DayEntry {
  weekday: Weekday;
  stichworte: string;
  text: string;
  /** Tagesanhänge in Reihenfolge ihres Hinzufügens (optional; fehlend = []). */
  attachments?: Attachment[];
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
  /**
   * Optionale manuelle Überschreibung des Gesamtjournals (0–50'000 Zeichen).
   * Fehlt das Feld oder ist es leer, wird der Text aus den Feldern abgeleitet.
   */
  journalText?: string;
  /** ISO-String der letzten Änderung. */
  updatedAt: string;
}

/** Request an POST /api/generate, per "mode" unterschieden. */
export type GenerateRequest =
  | {
      mode: "day";
      weekday: Weekday;
      stichworte: string;
      /**
       * Tagesabsätze der direkt vorangegangenen Woche (Mo–Fr, nur nicht-leer),
       * als Kontext für einen stimmigen Übergang. Immer vorhanden; leere Liste,
       * wenn keine Vorwoche existiert oder diese keine Tagesabsätze enthält
       * (nie null, nie weggelassen).
       */
      previousWeekDays: { weekday: Weekday; text: string }[];
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
      /**
       * Optionale bestehende Reflexion als Ausgangsbasis bei Neugenerierung.
       * Fehlt das Feld oder ist es leer, bleibt die Erstgenerierung unverändert.
       */
      aktuelleReflexion?: string;
    }
  | {
      mode: "revise";
      /** Das vollständige aktuelle Gesamtjournal. */
      journalText: string;
      /** Natürlichsprachliche Überarbeitungs-Anweisung. */
      anweisung: string;
    };

/** Request an POST /api/confluence. */
export interface ConfluenceUploadRequest {
  /** Fertig zusammengesetzter Journaltext (composeJournal-Ausgabe). */
  journalText: string;
  kw: number;
  jahr: number;
  /** Strukturierte Tage mit Text und Anhängen für Link-/Code-/Bild-Wiedergabe. */
  days: DayEntry[];
  /** Reflexionsblock (Text). */
  reflexion: string;
}

/** Erfolgs-Antwort von POST /api/confluence. */
export interface ConfluenceUploadResponse {
  /** Kennzeichnet, ob die Seite neu erstellt oder aktualisiert wurde. */
  action: "created" | "updated";
}

/** Englische Wochentags-Schlüssel der Git_Summary_API (Mo–Fr). */
export type GitDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday";

/** Antwortform von GET /api/git-summary. */
export interface GitSummary {
  /** Unveränderte Eingabe-Kalenderwoche (1–53). */
  week: number;
  /** Unverändertes Eingabe-Jahr (2000–2100). */
  year: number;
  /** Genau fünf Schlüssel monday–friday mit Listen von Commit-Titeln. */
  days: Record<GitDay, string[]>;
}
