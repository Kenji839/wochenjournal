"use client";

import { useEffect, useState } from "react";
import DayCard from "@/components/DayCard";
import HistoryPanel from "@/components/HistoryPanel";
import JournalPreview from "@/components/JournalPreview";
import ReflectionPanel from "@/components/ReflectionPanel";
import WeekSelector from "@/components/WeekSelector";
import { getCurrentWeek } from "@/lib/date";
import { appendKeywords } from "@/lib/git-keywords";
import {
  displayedJournal,
  hasManualOverride,
  istInhaltsleer,
  withJournalText,
  withoutJournalText,
} from "@/lib/journal";
import {
  deleteWeek,
  findWeek,
  loadWeeks,
  previousWeekDays,
  previousWeeks,
  saveWeek,
} from "@/lib/storage";
import type { GitDay, GitSummary, Weekday, WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

type Generating =
  | { type: "day"; weekday: Weekday }
  | { type: "reflection" }
  | { type: "revise" }
  | null;

const FEHLERMELDUNG = "Generierung fehlgeschlagen. Bitte versuche es erneut.";

/** Mapping der deutschen Wochentage auf die englischen Git_Summary_API-Schluessel. */
const WEEKDAY_TO_GITDAY: Record<Weekday, GitDay> = {
  montag: "monday",
  dienstag: "tuesday",
  mittwoch: "wednesday",
  donnerstag: "thursday",
  freitag: "friday",
};

function emptyWeek(kw: number, jahr: number): WeekJournal {
  return {
    id: crypto.randomUUID(),
    kw,
    jahr,
    days: WEEKDAYS.map((w) => ({ weekday: w.key, stichworte: "", text: "" })),
    reflexion: "",
    updatedAt: new Date().toISOString(),
  };
}

export default function Home() {
  const initial = getCurrentWeek();
  const [weeks, setWeeks] = useState<WeekJournal[]>([]);
  const [week, setWeek] = useState<WeekJournal>(() =>
    emptyWeek(initial.kw, initial.jahr),
  );
  const [generating, setGenerating] = useState<Generating>(null);
  const [loadingGit, setLoadingGit] = useState<Weekday | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Beim Mount aus localStorage laden und aktive Woche bestimmen.
  // Der Effekt läuft erst nach der Hydration; Server und Client rendern initial
  // identisch die leere Woche, daher kein Hydration-Mismatch. Das einmalige
  // Setzen von State aus einer nicht-reaktiven Browser-API ist hier gewollt.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const loaded = loadWeeks();
    setWeeks(loaded);
    const { kw, jahr } = getCurrentWeek();
    const existing = findWeek(loaded, kw, jahr);
    if (existing) setWeek(existing);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const busy = generating !== null;

  /** Schreibt die Woche in den State und persistiert sie. */
  function commitWeek(next: WeekJournal) {
    const list = saveWeek(next);
    setWeeks(list);
    setWeek(list.find((w) => w.id === next.id) ?? next);
  }

  function selectWeek(kw: number, jahr: number) {
    if (busy) return;
    const existing = findWeek(weeks, kw, jahr);
    setWeek(existing ?? emptyWeek(kw, jahr));
    setError(null);
  }

  function setStichworte(weekday: Weekday, value: string) {
    commitWeek({
      ...week,
      days: week.days.map((d) =>
        d.weekday === weekday ? { ...d, stichworte: value } : d,
      ),
    });
  }

  function setDayText(weekday: Weekday, value: string) {
    commitWeek(
      withoutJournalText({
        ...week,
        days: week.days.map((d) =>
          d.weekday === weekday ? { ...d, text: value } : d,
        ),
      }),
    );
  }

  function setReflexion(value: string) {
    commitWeek(withoutJournalText({ ...week, reflexion: value }));
  }

  function selectFromHistory(selected: WeekJournal) {
    if (busy) return;
    setWeek(selected);
    setError(null);
  }

  function removeWeek(id: string) {
    const list = deleteWeek(id);
    setWeeks(list);
    if (week.id === id) {
      const { kw, jahr } = getCurrentWeek();
      setWeek(findWeek(list, kw, jahr) ?? emptyWeek(kw, jahr));
    }
  }

  /** Liest den text/plain-Stream und ruft pro Chunk onChunk mit dem Gesamttext. */
  async function readStream(res: Response, onChunk: (text: string) => void) {
    if (!res.ok) {
      // Generische Server-Meldung (z. B. erschöpftes Kontingent) auslesen und
      // weiterreichen, damit der Nutzer eine konkrete Rückmeldung erhält.
      const msg = (await res.text().catch(() => "")).trim();
      throw new Error(msg || FEHLERMELDUNG);
    }
    if (!res.body) throw new Error(FEHLERMELDUNG);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      onChunk(acc);
    }
    return acc;
  }

  async function generateDay(weekday: Weekday) {
    const day = week.days.find((d) => d.weekday === weekday);
    if (!day || day.stichworte.trim() === "" || busy) return;

    setError(null);
    setGenerating({ type: "day", weekday });
    let working: WeekJournal = {
      ...week,
      days: week.days.map((d) =>
        d.weekday === weekday ? { ...d, text: "" } : d,
      ),
    };
    setWeek(working);

    let previous: { weekday: Weekday; text: string }[] = [];
    try {
      previous = previousWeekDays(weeks, week.kw, week.jahr);
    } catch {
      previous = [];
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "day",
          weekday,
          stichworte: day.stichworte,
          previousWeekDays: previous,
        }),
      });
      await readStream(res, (text) => {
        working = {
          ...working,
          days: working.days.map((d) =>
            d.weekday === weekday ? { ...d, text } : d,
          ),
        };
        setWeek(working);
      });
      setGenerating(null);
      commitWeek(withoutJournalText(working));
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error && err.message ? err.message : FEHLERMELDUNG);
    }
  }

  async function loadFromGit(weekday: Weekday) {
    if (busy || loadingGit !== null) return;

    const label = WEEKDAYS.find((w) => w.key === weekday)?.label ?? "Tag";

    setError(null);
    setLoadingGit(weekday);
    try {
      const res = await fetch(
        `/api/git-summary?week=${week.kw}&year=${week.jahr}`,
      );
      // Bei Fehlerstatus das Stichwort-Feld unveraendert lassen und Feedback geben.
      if (!res.ok) {
        setError(
          `Git-Stichworte konnten nicht geladen werden (Status ${res.status}).`,
        );
        return;
      }

      const data: GitSummary = await res.json();
      const titles = data.days[WEEKDAY_TO_GITDAY[weekday]] ?? [];
      // Leere oder fehlende Liste: Feld unveraendert lassen und Feedback geben.
      if (titles.length === 0) {
        setError(`Keine Git-Commits für ${label} (KW ${week.kw}) gefunden.`);
        return;
      }

      const existing =
        week.days.find((d) => d.weekday === weekday)?.stichworte ?? "";
      setStichworte(weekday, appendKeywords(existing, titles));
    } catch {
      // Fehler beim Laden/Einfuegen: bestehenden Inhalt unveraendert lassen.
      setError("Git-Stichworte konnten nicht geladen werden.");
    } finally {
      setLoadingGit(null);
    }
  }

  async function generateReflection() {
    const days = week.days
      .filter((d) => d.text.trim() !== "")
      .map((d) => ({ weekday: d.weekday, text: d.text }));
    if (days.length === 0 || busy) return;

    const prev = previousWeeks(weeks, week.kw, week.jahr).map((w) => ({
      kw: w.kw,
      jahr: w.jahr,
      reflexion: w.reflexion,
    }));

    const aktuelleReflexion = week.reflexion;

    setError(null);
    setGenerating({ type: "reflection" });
    let working: WeekJournal = { ...week, reflexion: "" };
    setWeek(working);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "reflection",
          kw: week.kw,
          jahr: week.jahr,
          days,
          previousWeeks: prev,
          ...(aktuelleReflexion.trim() !== "" ? { aktuelleReflexion } : {}),
        }),
      });
      await readStream(res, (text) => {
        working = { ...working, reflexion: text };
        setWeek(working);
      });
      setGenerating(null);
      commitWeek(withoutJournalText(working));
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error && err.message ? err.message : FEHLERMELDUNG);
    }
  }

  const hatTagesabsatz = week.days.some((d) => d.text.trim() !== "");
  const previousCount = previousWeeks(weeks, week.kw, week.jahr).length;

  /** Speichert eine manuelle Überschreibung des Gesamtjournals aus dem Editor. */
  function setJournalText(value: string) {
    commitWeek(withJournalText(week, value));
  }

  /** Verwirft die manuelle Überschreibung und nutzt wieder den abgeleiteten Text. */
  function resetJournalToDerived() {
    commitWeek(withoutJournalText(week));
  }

  /** Überarbeitet das Gesamtjournal per KI anhand einer Anweisung (Streaming). */
  async function reviseJournal(anweisung: string) {
    if (busy || anweisung.trim() === "") return;
    if (istInhaltsleer(week)) {
      setError("Erfasse zuerst Inhalte, bevor du das Journal überarbeitest.");
      return;
    }
    const original = displayedJournal(week);
    setError(null);
    setGenerating({ type: "revise" });
    let working: WeekJournal = { ...week, journalText: "" };
    setWeek(working);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", journalText: original, anweisung }),
      });
      await readStream(res, (text) => {
        working = { ...working, journalText: text };
        setWeek(working);
      });
      setGenerating(null);
      commitWeek(working);
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error && err.message ? err.message : FEHLERMELDUNG);
    }
  }

  return (
    <div className="w-full px-4 sm:px-12 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-ink">
          📓 Wochenjournal-Generator
        </h1>
        <p className="text-sm text-ink/60">Wochenjournal – 3. Lehrjahr</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <WeekSelector kw={week.kw} jahr={week.jahr} onChange={selectWeek} />

          <HistoryPanel
            weeks={weeks}
            activeId={week.id}
            onSelect={selectFromHistory}
            onDelete={removeWeek}
          />
        </div>

        <div className="flex flex-col gap-6">
          {error && (
            <div
              role="alert"
              className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-card border border-danger bg-white px-4 py-3 text-sm text-danger shadow-lg"
            >
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Meldung schliessen"
                className="shrink-0 font-semibold text-danger hover:opacity-70"
              >
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(5,minmax(min-content,1fr))]">
            {WEEKDAYS.map(({ key, label }) => {
              const day = week.days.find((d) => d.weekday === key)!;
              return (
                <DayCard
                  key={key}
                  day={day}
                  label={label}
                  streaming={
                    generating?.type === "day" && generating.weekday === key
                  }
                  busy={busy}
                  loadingGit={loadingGit === key}
                  onStichworteChange={(v) => setStichworte(key, v)}
                  onTextChange={(v) => setDayText(key, v)}
                  onGenerate={() => generateDay(key)}
                  onLoadFromGit={() => loadFromGit(key)}
                />
              );
            })}
          </div>

          <ReflectionPanel
            reflexion={week.reflexion}
            streaming={generating?.type === "reflection"}
            busy={busy}
            canGenerate={hatTagesabsatz}
            previousCount={previousCount}
            onTextChange={setReflexion}
            onGenerate={generateReflection}
          />

          <JournalPreview
            week={week}
            displayedText={displayedJournal(week)}
            isOverride={hasManualOverride(week)}
            istLeer={istInhaltsleer(week)}
            revising={generating?.type === "revise"}
            busy={busy}
            onJournalTextChange={setJournalText}
            onReset={resetJournalToDerived}
            onRevise={reviseJournal}
            onError={setError}
          />
        </div>
      </div>
    </div>
  );
}
