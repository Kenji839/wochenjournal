"use client";

import { useEffect, useState } from "react";
import DayCard from "@/components/DayCard";
import HistoryPanel from "@/components/HistoryPanel";
import JournalPreview from "@/components/JournalPreview";
import ReflectionPanel from "@/components/ReflectionPanel";
import WeekSelector from "@/components/WeekSelector";
import { getCurrentWeek } from "@/lib/date";
import {
  deleteWeek,
  findWeek,
  loadWeeks,
  previousWeeks,
  saveWeek,
} from "@/lib/storage";
import type { Weekday, WeekJournal } from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

type Generating =
  | { type: "day"; weekday: Weekday }
  | { type: "reflection" }
  | null;

const FEHLERMELDUNG = "Generierung fehlgeschlagen. Bitte versuche es erneut.";

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
    commitWeek({
      ...week,
      days: week.days.map((d) =>
        d.weekday === weekday ? { ...d, text: value } : d,
      ),
    });
  }

  function setReflexion(value: string) {
    commitWeek({ ...week, reflexion: value });
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

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "day", weekday, stichworte: day.stichworte }),
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
      commitWeek(working);
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error && err.message ? err.message : FEHLERMELDUNG);
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
        }),
      });
      await readStream(res, (text) => {
        working = { ...working, reflexion: text };
        setWeek(working);
      });
      setGenerating(null);
      commitWeek(working);
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error && err.message ? err.message : FEHLERMELDUNG);
    }
  }

  const hatTagesabsatz = week.days.some((d) => d.text.trim() !== "");
  const previousCount = previousWeeks(weeks, week.kw, week.jahr).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">
          📓 Wochenjournal-Generator
        </h1>
        <p className="text-sm text-ink/60">Appbakery / SBB – Lehrjahr 3</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <WeekSelector kw={week.kw} jahr={week.jahr} onChange={selectWeek} />
        </div>

        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          {error && (
            <div
              role="alert"
              className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-sbb-red bg-white px-4 py-3 text-sm text-sbb-red shadow-lg"
            >
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Meldung schliessen"
                className="shrink-0 font-semibold text-sbb-red hover:opacity-70"
              >
                ✕
              </button>
            </div>
          )}

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
                onStichworteChange={(v) => setStichworte(key, v)}
                onTextChange={(v) => setDayText(key, v)}
                onGenerate={() => generateDay(key)}
              />
            );
          })}

          <ReflectionPanel
            reflexion={week.reflexion}
            streaming={generating?.type === "reflection"}
            busy={busy}
            canGenerate={hatTagesabsatz}
            previousCount={previousCount}
            onTextChange={setReflexion}
            onGenerate={generateReflection}
          />

          <JournalPreview week={week} />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <HistoryPanel
            weeks={weeks}
            activeId={week.id}
            onSelect={selectFromHistory}
            onDelete={removeWeek}
          />
        </div>
      </div>
    </div>
  );
}
