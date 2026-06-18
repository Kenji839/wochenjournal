"use client";

import type { DayEntry } from "@/types/journal";

interface DayCardProps {
  day: DayEntry;
  label: string;
  /** Dieser Tag wird gerade gestreamt. */
  streaming: boolean;
  /** Irgendeine Generierung läuft → Bedienelemente sperren. */
  busy: boolean;
  /** Für diesen Tag läuft gerade ein Git-Ladevorgang. */
  loadingGit: boolean;
  onStichworteChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onGenerate: () => void;
  /** Lädt die Commit-Titel dieses Tages aus Git und fügt sie an. */
  onLoadFromGit: () => void;
}

export default function DayCard({
  day,
  label,
  streaming,
  busy,
  loadingGit,
  onStichworteChange,
  onTextChange,
  onGenerate,
  onLoadFromGit,
}: DayCardProps) {
  const canGenerate = day.stichworte.trim() !== "" && !busy;

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{label}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onLoadFromGit}
            disabled={busy || loadingGit}
            className="shrink-0 whitespace-nowrap rounded-control border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingGit ? "Laden …" : "Aus Git laden"}
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="shrink-0 whitespace-nowrap rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {day.text.trim() ? "Neu generieren" : "Tag generieren"}
          </button>
        </div>
      </div>

      <textarea
        value={day.stichworte}
        onChange={(e) => onStichworteChange(e.target.value)}
        disabled={busy}
        rows={3}
        placeholder="Stichworte zum Tag …"
        className="w-full min-w-0 flex-1 resize-y rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
      />

      {streaming ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
          {day.text}
          <span className="ml-0.5 inline-block animate-pulse">▋</span>
        </p>
      ) : day.text.trim() ? (
        <textarea
          value={day.text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={4}
          className="mt-3 w-full min-w-0 flex-1 resize-y rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        />
      ) : null}
    </div>
  );
}
