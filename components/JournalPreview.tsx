"use client";

import { useState } from "react";
import { composeJournal } from "@/lib/journal";
import type { ConfluenceUploadResponse, WeekJournal } from "@/types/journal";

interface JournalPreviewProps {
  week: WeekJournal;
}

type UploadStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; action: "created" | "updated" }
  | { kind: "error" };

export default function JournalPreview({ week }: JournalPreviewProps) {
  const [kopiert, setKopiert] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const text = composeJournal(week);

  // Leer-Prüfung: kein Tagesabsatz und keine Reflexion → kein Upload.
  // composeJournal liefert immer Header + Tageszeilen mit "–"-Platzhaltern,
  // daher die Wochendaten prüfen statt den zusammengesetzten Text.
  const istLeer =
    !week.days.some((d) => d.text.trim() !== "") &&
    week.reflexion.trim() === "";

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

  const handleUpload = async () => {
    if (istLeer || status.kind === "loading") return;

    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/confluence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalText: text, kw: week.kw, jahr: week.jahr }),
      });
      if (!res.ok) {
        setStatus({ kind: "error" });
        return;
      }
      const data = (await res.json()) as ConfluenceUploadResponse;
      setStatus({ kind: "success", action: data.action });
    } catch {
      setStatus({ kind: "error" });
    }
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
          <button
            type="button"
            onClick={handleUpload}
            disabled={istLeer || status.kind === "loading"}
            className="rounded-md border border-sbb-red bg-white px-3 py-1.5 text-sm font-medium text-sbb-red hover:bg-sbb-red/5 disabled:opacity-50"
          >
            Nach Confluence hochladen
          </button>
        </div>
      </div>

      {istLeer && (
        <p className="mb-3 text-sm text-ink/60">
          Erfasse zuerst Inhalte, bevor du hochlädst.
        </p>
      )}

      {status.kind === "loading" && (
        <p className="mb-3 text-sm text-ink/60">Wird hochgeladen …</p>
      )}

      {status.kind === "success" && (
        <p className="mb-3 text-sm text-ink/60">
          {status.action === "created" ? "Seite erstellt." : "Seite aktualisiert."}
        </p>
      )}

      {status.kind === "error" && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-sbb-red bg-sbb-red/5 px-4 py-3 text-sm text-sbb-red"
        >
          Upload fehlgeschlagen. Bitte versuche es erneut.
        </div>
      )}

      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-page p-3 text-sm text-ink">
        {text}
      </pre>
    </div>
  );
}
