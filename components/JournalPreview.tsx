"use client";

import { useState } from "react";
import { journalFileName } from "@/lib/journal";
import type {
  ConfluenceUploadRequest,
  ConfluenceUploadResponse,
  WeekJournal,
} from "@/types/journal";

interface JournalPreviewProps {
  week: WeekJournal;
  displayedText: string;
  isOverride: boolean;
  istLeer: boolean;
  revising: boolean;
  busy: boolean;
  onJournalTextChange: (value: string) => void;
  onReset: () => void;
  onRevise: (anweisung: string) => void;
  onError: (message: string) => void;
}

type UploadStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; action: "created" | "updated" }
  | { kind: "error" };

export default function JournalPreview({
  week,
  displayedText,
  isOverride,
  istLeer,
  revising,
  busy,
  onJournalTextChange,
  onReset,
  onRevise,
  onError,
}: JournalPreviewProps) {
  const [kopiert, setKopiert] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const [bestaetigungOffen, setBestaetigungOffen] = useState(false);
  const [anweisung, setAnweisung] = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedText);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      onError("Kopieren fehlgeschlagen. Zwischenablage nicht verfügbar.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([displayedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = journalFileName(week);
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
        body: JSON.stringify({
          journalText: displayedText,
          kw: week.kw,
          jahr: week.jahr,
          days: week.days,
          reflexion: week.reflexion,
        } satisfies ConfluenceUploadRequest),
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

  const handleReviseClick = () => {
    if (anweisung.trim() === "" || busy) return;
    onRevise(anweisung);
    setAnweisung("");
  };

  const handleResetConfirm = () => {
    setBestaetigungOffen(false);
    onReset();
  };

  return (
    <div className="rounded-card border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">Gesamtes Journal</h2>
          {isOverride && (
            <span className="rounded-full border border-primary bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
              Manuell bearbeitet
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={istLeer}
            className="rounded-control border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {kopiert ? "✓ Kopiert!" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={istLeer}
            className="rounded-control border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Download .txt
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={istLeer || status.kind === "loading"}
            className="rounded-control border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
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
          className="mb-3 rounded-card border border-danger bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          Upload fehlgeschlagen. Bitte versuche es erneut.
        </div>
      )}

      {/* Editor bzw. Streamdarstellung während der Überarbeitung */}
      {revising ? (
        <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-control bg-page p-3 text-sm text-ink">
          {displayedText}
          <span className="ml-0.5 inline-block animate-pulse">▋</span>
        </p>
      ) : (
        <textarea
          value={displayedText}
          onChange={(e) => onJournalTextChange(e.target.value)}
          maxLength={20000}
          rows={18}
          className="w-full resize-y rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        />
      )}

      {/* Aktion: aus Tagesfeldern neu zusammensetzen (nur bei Override) */}
      {isOverride && (
        <div className="mt-3">
          {bestaetigungOffen ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink/70">
                Manuelle Bearbeitung verwerfen?
              </span>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="rounded-control border border-primary bg-white px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                Verwerfen
              </button>
              <button
                type="button"
                onClick={() => setBestaetigungOffen(false)}
                className="rounded-control border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBestaetigungOffen(true)}
              className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              Aus Tagesfeldern neu zusammensetzen
            </button>
          )}
        </div>
      )}

      {/* Reviser: KI-Überarbeitung per Anweisung */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={anweisung}
          onChange={(e) => setAnweisung(e.target.value)}
          placeholder="Anweisung für die KI-Überarbeitung …"
          className="flex-1 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        />
        <button
          type="button"
          onClick={handleReviseClick}
          disabled={anweisung.trim() === "" || busy}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mit KI überarbeiten
        </button>
      </div>
    </div>
  );
}
