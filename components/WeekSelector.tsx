"use client";

interface WeekSelectorProps {
  kw: number;
  jahr: number;
  onChange: (kw: number, jahr: number) => void;
}

export default function WeekSelector({ kw, jahr, onChange }: WeekSelectorProps) {
  const clampKw = (value: number) => Math.min(53, Math.max(1, value));

  return (
    <div className="rounded-card border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-ink">Woche</h2>
      <div className="flex gap-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-ink/70">Kalenderwoche</span>
          <input
            type="number"
            min={1}
            max={53}
            value={kw}
            onChange={(e) =>
              onChange(clampKw(Number(e.target.value) || 1), jahr)
            }
            className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-ink/70">Jahr</span>
          <input
            type="number"
            value={jahr}
            onChange={(e) =>
              onChange(kw, Number(e.target.value) || jahr)
            }
            className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          />
        </label>
      </div>
    </div>
  );
}
