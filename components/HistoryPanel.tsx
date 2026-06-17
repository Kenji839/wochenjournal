"use client";

import type { WeekJournal } from "@/types/journal";

interface HistoryPanelProps {
  weeks: WeekJournal[];
  activeId: string;
  onSelect: (week: WeekJournal) => void;
  onDelete: (id: string) => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-CH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export default function HistoryPanel({
  weeks,
  activeId,
  onSelect,
  onDelete,
}: HistoryPanelProps) {
  return (
    <div className="rounded-card border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-ink">Verlauf</h2>

      {weeks.length === 0 ? (
        <p className="text-sm text-ink/60">Noch keine Einträge.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {weeks.map((week) => (
            <li
              key={week.id}
              className={`flex items-center justify-between rounded-control border px-3 py-2 ${
                week.id === activeId
                  ? "border-primary bg-primary/5"
                  : "border-line bg-white"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(week)}
                className="flex flex-1 flex-col items-start rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                <span className="text-sm font-medium text-ink">
                  KW {week.kw} / {week.jahr}
                </span>
                <span className="text-xs text-ink/60">
                  {formatTimestamp(week.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(week.id)}
                aria-label={`KW ${week.kw} / ${week.jahr} löschen`}
                className="ml-2 rounded-control px-2 py-1 text-ink/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
