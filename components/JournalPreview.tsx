"use client";

import { useState } from "react";
import { composeJournal } from "@/lib/journal";
import type { WeekJournal } from "@/types/journal";

interface JournalPreviewProps {
  week: WeekJournal;
}

export default function JournalPreview({ week }: JournalPreviewProps) {
  const [kopiert, setKopiert] = useState(false);
  const text = composeJournal(week);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Clipboard nicht verfügbar – still ignorieren.
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arbeitsjournal-kw${week.kw}-${week.jahr}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Gesamtes Journal</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-sbb-red bg-white px-3 py-1.5 text-sm font-medium text-sbb-red hover:bg-sbb-red/5"
          >
            {kopiert ? "✓ Kopiert!" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-md border border-sbb-red bg-white px-3 py-1.5 text-sm font-medium text-sbb-red hover:bg-sbb-red/5"
          >
            Download .txt
          </button>
        </div>
      </div>

      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-page p-3 text-sm text-ink">
        {text}
      </pre>
    </div>
  );
}
