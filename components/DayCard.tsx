"use client";

import { useRef, useState } from "react";
import type { Attachment, DayEntry } from "@/types/journal";
import {
  ALLOWED_IMAGE_MIME,
  validateCode,
  validateImageMeta,
  validateLink,
} from "@/lib/attachments";

interface DayCardProps {
  day: DayEntry;
  label: string;
  /** Dieser Tag wird gerade gestreamt. */
  streaming: boolean;
  /** Irgendeine Generierung läuft → Bedienelemente sperren. */
  busy: boolean;
  /** Für diesen Tag läuft gerade ein Git-Ladevorgang. */
  loadingGit: boolean;
  /** Dieser Tag ist der heutige Wochentag → hervorheben. */
  isToday: boolean;
  onStichworteChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onGenerate: () => void;
  /** Lädt die Commit-Titel dieses Tages aus Git und fügt sie an. */
  onLoadFromGit: () => void;
  /** Fügt einen erfassten/validierten Anhang dem Tag hinzu. */
  onAddAttachment?: (attachment: Attachment) => void;
  /** Entfernt einen Anhang dieses Tages anhand der id. */
  onRemoveAttachment?: (attachmentId: string) => void;
}

/** Welcher Anhang-Typ wird gerade erfasst (keiner = Auswahlleiste). */
type AttachmentForm = "link" | "code" | "image" | null;

export default function DayCard({
  day,
  label,
  streaming,
  busy,
  loadingGit,
  isToday,
  onStichworteChange,
  onTextChange,
  onGenerate,
  onLoadFromGit,
  onAddAttachment,
  onRemoveAttachment,
}: DayCardProps) {
  const canGenerate = day.stichworte.trim() !== "" && !busy;

  const attachments = day.attachments ?? [];

  // Lokaler Erfassungs-State des Day_Attachment_Editor.
  const [activeForm, setActiveForm] = useState<AttachmentForm>(null);
  const [url, setUrl] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("");
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wechselt das aktive Formular und setzt Hinweis zurück (Eingaben bleiben
  // erhalten, bis ein Anhang erfolgreich hinzugefügt wurde).
  function selectForm(form: AttachmentForm) {
    setHint("");
    setActiveForm((current) => (current === form ? null : form));
  }

  // Link erfassen: bei Erfolg Anhang anlegen, Felder leeren und Formular
  // schliessen; bei Fehler Hinweis zeigen und Eingaben stehen lassen.
  function handleAddLink() {
    const result = validateLink(url, displayText);
    if (!result.ok) {
      setHint(result.hint);
      return;
    }
    onAddAttachment?.(result.value);
    setUrl("");
    setDisplayText("");
    setHint("");
    setActiveForm(null);
  }

  // Code erfassen (analog zum Link; Quelltext bleibt bei Fehler erhalten).
  function handleAddCode() {
    const result = validateCode(code, language);
    if (!result.ok) {
      setHint(result.hint);
      return;
    }
    onAddAttachment?.(result.value);
    setCode("");
    setLanguage("");
    setHint("");
    setActiveForm(null);
  }

  // Bild erfassen: zuerst Metadaten prüfen, dann die Datei als Base64 (ohne
  // Data-URL-Präfix) lesen und den Image_Attachment anlegen.
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const meta = validateImageMeta({
      mimeType: file.type,
      byteSize: file.size,
      caption,
    });
    if (!meta.ok) {
      setHint(meta.hint);
      // Auswahl zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setHint("Die Datei konnte nicht gelesen werden.");
        return;
      }
      // "data:<mime>;base64,<DATEN>" → nur die reinen Base64-Daten behalten.
      const base64 = result.slice(result.indexOf(",") + 1);
      onAddAttachment?.({
        id: crypto.randomUUID(),
        type: "image",
        data: base64,
        mimeType: meta.value.mimeType,
        filename: file.name,
        ...(meta.value.caption !== undefined
          ? { caption: meta.value.caption }
          : {}),
      });
      setCaption("");
      setHint("");
      setActiveForm(null);
    };
    reader.onerror = () => {
      setHint("Die Datei konnte nicht gelesen werden.");
    };
    reader.readAsDataURL(file);
    // Auswahl zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
    event.target.value = "";
  }

  return (
    <div
      className={`flex h-full flex-col rounded-card border bg-panel p-5 shadow-sm ${
        isToday
          ? "border-primary ring-2 ring-primary/40"
          : "border-line"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          {label}
          {isToday && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">
              Heute
            </span>
          )}
        </h3>
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

      {/* Day_Attachment_Editor: Anhänge erfassen, anzeigen und entfernen. */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink/70">Anhang:</span>
          <button
            type="button"
            onClick={() => selectForm("link")}
            disabled={busy}
            className={`rounded-control border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              activeForm === "link"
                ? "border-primary bg-primary text-on-primary"
                : "border-line bg-white text-ink hover:bg-panel"
            }`}
          >
            Link
          </button>
          <button
            type="button"
            onClick={() => selectForm("code")}
            disabled={busy}
            className={`rounded-control border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              activeForm === "code"
                ? "border-primary bg-primary text-on-primary"
                : "border-line bg-white text-ink hover:bg-panel"
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => selectForm("image")}
            disabled={busy}
            className={`rounded-control border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              activeForm === "image"
                ? "border-primary bg-primary text-on-primary"
                : "border-line bg-white text-ink hover:bg-panel"
            }`}
          >
            Bild
          </button>
        </div>

        {activeForm === "link" && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              placeholder="URL (http:// oder https://)"
              className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
            />
            <input
              type="text"
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              disabled={busy}
              placeholder="Anzeigetext (optional)"
              className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={busy}
              className="self-start rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Link hinzufügen
            </button>
          </div>
        )}

        {activeForm === "code" && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
              placeholder="Sprache (optional, z. B. ts)"
              className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
            />
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              rows={4}
              placeholder="Quelltext …"
              className="w-full min-w-0 resize-y rounded-control border border-line bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleAddCode}
              disabled={busy}
              className="self-start rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Code hinzufügen
            </button>
          </div>
        )}

        {activeForm === "image" && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy}
              placeholder="Bildunterschrift (optional)"
              className="w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-60"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIME.join(",")}
              onChange={handleFileChange}
              disabled={busy}
              className="w-full min-w-0 text-sm text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-panel disabled:opacity-60"
            />
          </div>
        )}

        {hint && (
          <p className="mt-2 text-xs text-primary" role="alert">
            {hint}
          </p>
        )}

        {attachments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-start justify-between gap-2 rounded-control border border-line bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1 text-sm text-ink">
                  {attachment.type === "link" && (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-primary underline hover:text-primary-hover"
                    >
                      {attachment.displayText ?? attachment.url}
                    </a>
                  )}
                  {attachment.type === "code" && (
                    <div className="min-w-0">
                      {attachment.language && (
                        <span className="mb-1 inline-block rounded-full bg-panel px-2 py-0.5 text-xs font-medium text-ink/70">
                          {attachment.language}
                        </span>
                      )}
                      <pre className="overflow-x-auto whitespace-pre rounded-control bg-panel px-2 py-1 font-mono text-xs text-ink">
                        {attachment.source}
                      </pre>
                    </div>
                  )}
                  {attachment.type === "image" && (
                    <div className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${attachment.mimeType};base64,${attachment.data}`}
                        alt={attachment.caption ?? attachment.filename}
                        className="max-h-40 max-w-full rounded-control border border-line"
                      />
                      <span className="mt-1 block break-all text-xs text-ink/70">
                        {attachment.caption ?? attachment.filename}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(attachment.id)}
                  disabled={busy}
                  className="shrink-0 rounded-control border border-line bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
