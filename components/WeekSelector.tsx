"use client";

interface WeekSelectorProps {
  kw: number;
  jahr: number;
  onChange: (kw: number, jahr: number) => void;
}

export default function WeekSelector({ kw, jahr, onChange }: WeekSelectorProps) {
  const clampKw = (value: number) => Math.min(53, Math.max(1, value));

  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">Woche</h2>
      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink/70">Kalenderwoche</span>
          <input
            type="number"
            min={1}
            max={53}
            value={kw}
            onChange={(e) =>
              onChange(clampKw(Number(e.target.value) || 1), jahr)
            }
            className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-sbb-red"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink/70">Jahr</span>
          <input
            type="number"
            value={jahr}
            onChange={(e) =>
              onChange(kw, Number(e.target.value) || jahr)
            }
            className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-sbb-red"
          />
        </label>
      </div>
    </div>
  );
}
