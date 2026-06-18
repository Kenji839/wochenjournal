// Serverseitige Logik für die Git-Tagesstichworte (git-day-entries).
// Reine, isoliert testbare Funktionen ohne git-Aufruf.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { isoWeekWorkdays } from "@/lib/date";
import type { GitDay, GitSummary } from "@/types/journal";

/** Trenner in der git-log-Ausgabe (Unit Separator, in Subjects unmöglich). */
const FELD = "\x1f";

/** Erlaubte Pfadzeichen; Shell-Metazeichen führen zur Ablehnung. */
const VERBOTENE_PFADZEICHEN = /[;|&$`"'\n\r]/;

/** Fallback-Repository_Pfad, relativ zum Arbeitsverzeichnis des Servers. */
export const DEFAULT_REPO_PATH = "../inclusive-app-backend";

/** Feste Reihenfolge der fünf Werktags-Schlüssel (Mo–Fr). */
const GIT_DAYS: GitDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

/**
 * Parst die rohe git-log-Ausgabe (eine Zeile pro Commit:
 * "<author>\x1f<YYYY-MM-DD>\x1f<subject>") in strukturierte Commits.
 * Reine Funktion – ohne git-Aufruf, damit isoliert testbar.
 *
 * Leere Zeilen werden ignoriert.
 */
export function parseGitLog(
  raw: string,
): { author: string; date: string; subject: string }[] {
  return raw
    .split("\n")
    .filter((zeile) => zeile.length > 0)
    .map((zeile) => {
      const [author, date, subject] = zeile.split(FELD);
      return { author, date, subject };
    });
}

/**
 * Gruppiert geparste Commits nach Wochentag anhand der fünf Werktagsdaten.
 * Wendet Merge- und Author-Filter an. Reine Funktion.
 *
 * - Ergebnis enthält genau die fünf Schlüssel monday–friday, je mit einer
 *   (ggf. leeren) Liste von Commit-Titeln.
 * - Commits, deren Subject mit "Merge " beginnt, werden ausgeschlossen.
 * - Ist `configuredAuthor` gesetzt, werden nur Commits dieses Authors
 *   berücksichtigt; bei `null` entfällt der Author-Filter.
 * - Die Zuordnung erfolgt per exaktem Datums-String-Vergleich gegen
 *   `workdays`; Sa/So und Daten ausserhalb der Woche matchen keinen Tag und
 *   entfallen.
 * - Identische Titel je Tag werden dedupliziert (erstes Vorkommen bleibt).
 *   So erscheint ein Commit nicht doppelt, wenn er nach Rebase-/Squash-/
 *   Cherry-pick-Merge mit neuer SHA zusätzlich auf einem anderen Branch liegt.
 * - Die Reihenfolge innerhalb eines Tages entspricht der Eingabereihenfolge
 *   (chronologisch, da `--reverse` upstream); es wird nicht neu sortiert.
 */
export function groupByWeekday(
  commits: { author: string; date: string; subject: string }[],
  workdays: { day: GitDay; date: string }[],
  configuredAuthor: string | null,
): Record<GitDay, string[]> {
  // Ergebnis mit genau fünf Schlüsseln, je leere Liste, initialisieren.
  const result = Object.fromEntries(
    GIT_DAYS.map((tag) => [tag, [] as string[]]),
  ) as Record<GitDay, string[]>;

  // Datum → Wochentags-Schlüssel für den exakten String-Vergleich.
  const dateToDay = new Map(workdays.map(({ day, date }) => [date, day]));
  // Bereits aufgenommene Titel je Tag, um Duplikate zu vermeiden.
  const seen = new Map<GitDay, Set<string>>(
    GIT_DAYS.map((tag) => [tag, new Set<string>()]),
  );

  for (const commit of commits) {
    // Merge-Filter: Subjects mit "Merge "-Präfix entfallen.
    if (commit.subject.startsWith("Merge ")) {
      continue;
    }
    // Author-Filter nur, wenn ein Konfigurierter_Author bekannt ist.
    if (configuredAuthor !== null && commit.author !== configuredAuthor) {
      continue;
    }
    // Tageszuordnung per exaktem Datums-String-Vergleich.
    const tag = dateToDay.get(commit.date);
    if (tag === undefined) {
      continue;
    }
    // Duplikate (gleicher Titel am selben Tag) überspringen.
    const bekannt = seen.get(tag)!;
    if (bekannt.has(commit.subject)) {
      continue;
    }
    bekannt.add(commit.subject);
    result[tag].push(commit.subject);
  }

  return result;
}

/**
 * Baut eine Leere_Antwort: unveränderte week/year und fünf leere Listen.
 * Wird in jedem Fehler- oder Ablehnungsfall zurückgegeben.
 */
function leereAntwort(kw: number, jahr: number): GitSummary {
  const days = Object.fromEntries(
    GIT_DAYS.map((tag) => [tag, [] as string[]]),
  ) as Record<GitDay, string[]>;
  return { week: kw, year: jahr, days };
}

/**
 * Liest die Commit-Titel der ISO-Woche {kw}/{jahr} aus dem Repository und
 * gruppiert sie nach Wochentag (Mo–Fr). Fehlertolerant: liefert bei jedem
 * Problem eine Leere_Antwort (fünf leere Listen) mit unveränderten week/year.
 *
 * Sicherheit: kein Shell-Aufruf (execFileSync mit Argument-Array), variable
 * Werte als separate Argumente, Datumsgrenzen ausschliesslich serverseitig
 * berechnet. Pfade mit Shell-Metazeichen werden ohne git-Aufruf abgewiesen.
 * Im Fehlerfall werden weder Pfad noch stderr nach aussen gegeben.
 */
export function readGitSummary(
  repoPath: string,
  kw: number,
  jahr: number,
): GitSummary {
  // Pfad-Validierung: Shell-Metazeichen → Leere_Antwort, kein git-Aufruf.
  if (VERBOTENE_PFADZEICHEN.test(repoPath)) {
    return leereAntwort(kw, jahr);
  }

  // Relativen Pfad gegen das Arbeitsverzeichnis des Servers auflösen.
  const cwd = path.resolve(process.cwd(), repoPath);

  try {
    // Repo-Check: wirft, wenn kein git, kein Repo oder Pfad nicht existiert.
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });

    // Konfigurierten_Author bestimmen; Fehler oder leer → null (Filter aus).
    let configuredAuthor: string | null = null;
    try {
      const name = execFileSync("git", ["config", "user.name"], {
        cwd,
        encoding: "utf8",
      }).trim();
      configuredAuthor = name.length > 0 ? name : null;
    } catch {
      configuredAuthor = null;
    }

    // Datumsfenster serverseitig aus den validierten Parametern berechnen.
    const workdays = isoWeekWorkdays(kw, jahr);
    const since = workdays[0].date; // Montag
    const until = naechsterTag(workdays[4].date); // Samstag (Tag nach Freitag)

    // git log ohne Shell, variable Werte als separate Argumente.
    const raw = execFileSync(
      "git",
      [
        "log",
        "--all",
        "--reverse",
        "--no-merges",
        `--since=${since}`,
        `--until=${until}`,
        `--pretty=format:%an${FELD}%ad${FELD}%s`,
        "--date=short",
      ],
      { cwd, encoding: "utf8" },
    );

    const commits = parseGitLog(raw);
    const days = groupByWeekday(commits, workdays, configuredAuthor);
    return { week: kw, year: jahr, days };
  } catch {
    // Jeder git-Fehler (kein Binary, kein Repo, Ausführungsfehler) → leer.
    return leereAntwort(kw, jahr);
  }
}

/**
 * Zerlegt eine (ggf. kommagetrennte) Pfadangabe in einzelne, getrimmte
 * Repository_Pfade. Leere Teilstücke werden verworfen.
 */
export function parseRepoPaths(value: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Liest mehrere Repositories und führt die Commit-Titel pro Wochentag zusammen.
 * Jedes Repository wird über `readGitSummary` fehlertolerant ausgelesen; ein
 * nicht nutzbares Repository trägt einfach nichts bei. Die Reihenfolge folgt
 * den Repositories (Eingabereihenfolge), je Repository chronologisch.
 */
export function readGitSummaries(
  repoPaths: string[],
  kw: number,
  jahr: number,
): GitSummary {
  const merged = leereAntwort(kw, jahr);
  for (const repoPath of repoPaths) {
    const summary = readGitSummary(repoPath, kw, jahr);
    for (const tag of GIT_DAYS) {
      merged.days[tag].push(...summary.days[tag]);
    }
  }
  return merged;
}

/** Liefert den Folgetag eines "YYYY-MM-DD"-Datums als "YYYY-MM-DD" (UTC-stabil). */
function naechsterTag(isoDate: string): string {
  const [jahr, monat, tag] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(jahr, monat - 1, tag + 1));
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const t = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${t}`;
}
