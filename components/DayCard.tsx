"use client";

import type { DayEntry } from "@/types/journal";

interface DayCardProps {
  day: DayEntry;
  label: string;
  /** Dieser Tag wird gerade gestreamt. */
  streaming: boolean;
  /** Irgendeine Generierung läuft → Bedienelemente sperren. */
  busy: boolean;
  onStichworteChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onGenerate: () => void;
}

export default function DayCard({
  day,
  label,
  streaming,
  busy,
  onStichworteChange,
  onTextChange,
  onGenerate,
}: DayCardProps) {
  const canGenerate = day.stichworte.trim() !== "" && !busy;

  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{label}</h3>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="rounded-md bg-sbb-red px-3 py-1.5 text-sm font-medium text-white hover:bg-sbb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {day.text.trim() ? "Neu generieren" : "Tag generieren"}
        </button>
      </div>

      <textarea
        value={day.stichworte}
        onChange={(e) => onStichworteChange(e.target.value)}
        disabled={busy}
        rows={2}
        placeholder="Stichworte zum Tag …"
        className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sbb-red disabled:opacity-60"
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
          className="mt-3 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sbb-red"
        />
      ) : null}
    </div>
  );
}
