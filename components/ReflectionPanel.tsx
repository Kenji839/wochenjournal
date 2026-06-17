"use client";

interface ReflectionPanelProps {
  reflexion: string;
  /** Die Reflexion wird gerade gestreamt. */
  streaming: boolean;
  /** Irgendeine Generierung läuft → Bedienelemente sperren. */
  busy: boolean;
  /** Mindestens ein Tagesabsatz vorhanden. */
  canGenerate: boolean;
  /** Anzahl Vorwochen, die als Kontext einfliessen. */
  previousCount: number;
  onTextChange: (value: string) => void;
  onGenerate: () => void;
}

export default function ReflectionPanel({
  reflexion,
  streaming,
  busy,
  canGenerate,
  previousCount,
  onTextChange,
  onGenerate,
}: ReflectionPanelProps) {
  return (
    <div className="rounded-card border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Reflexion</h2>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || busy}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {reflexion.trim() ? "Neu generieren" : "Reflexion generieren"}
        </button>
      </div>

      {!canGenerate ? (
        <p className="text-sm text-ink/60">
          Erfasse zuerst mindestens einen Tag, um die Reflexion zu generieren.
        </p>
      ) : previousCount > 0 ? (
        <p className="mb-2 text-xs text-ink/60">
          Berücksichtigt die letzten {previousCount}{" "}
          {previousCount === 1 ? "Woche" : "Wochen"} als Kontext.
        </p>
      ) : null}

      {streaming ? (
        <p className="whitespace-pre-wrap text-sm text-ink">
          {reflexion}
          <span className="ml-0.5 inline-block animate-pulse">▋</span>
        </p>
      ) : reflexion.trim() ? (
        <textarea
          value={reflexion}
          onChange={(e) => onTextChange(e.target.value)}
          rows={12}
          className="w-full resize-y rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        />
      ) : null}
    </div>
  );
}
