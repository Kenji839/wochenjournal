// Reine, JSX-freie Anhang-Logik: Grenzwerte, Validierung und Konstruktion der
// Tagesanhänge (Link/Code/Bild). Die Tageskarte ruft ausschliesslich diese
// reinen Funktionen auf; so bleibt die Geschäftslogik aus der Komponente und
// die Regeln sind property-basiert testbar. Nutzerseitige Hinweise sind in
// Schweizer Hochdeutsch (kein "ß", immer "ss").

import type {
  Attachment,
  CodeAttachment,
  DayEntry,
  ImageAttachment,
  LinkAttachment,
} from "@/types/journal";

// Grenzwerte (UPPER_SNAKE_CASE für echte Konstanten).
export const MAX_ATTACHMENTS_PER_DAY = 10;
export const MAX_URL_LENGTH = 2048;
export const MAX_DISPLAY_TEXT_LENGTH = 200;
export const MAX_CODE_LENGTH = 100_000;
export const MAX_LANGUAGE_LENGTH = 30;
export const MAX_CAPTION_LENGTH = 200;
export const MAX_IMAGE_BYTES = 2_000_000; // genau 2_000_000 noch zulässig
export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

/**
 * Ergebnis einer Validierung: Erfolg liefert den erzeugten Wert, Fehler einen
 * Hinweistext (UI-Sprache: Schweizer Hochdeutsch).
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; hint: string };

/**
 * Validiert eine Link-Eingabe (URL/Anzeigetext) und erzeugt bei Erfolg einen
 * LinkAttachment. Die URL wird zum Prüfen und Speichern getrimmt; ein leerer
 * Anzeigetext entfällt. Keine Eingabe wird über das Spezifizierte hinaus
 * verändert (Requirements 2.1–2.5).
 */
export function validateLink(
  rawUrl: string,
  rawDisplayText: string,
): ValidationResult<LinkAttachment> {
  const url = rawUrl.trim();

  if (url === "") {
    return { ok: false, hint: "Eine URL ist erforderlich." };
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return {
      ok: false,
      hint: "Bitte eine gültige URL angeben, die mit http:// oder https:// beginnt.",
    };
  }
  if (url.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      hint: `Die URL darf höchstens ${MAX_URL_LENGTH} Zeichen lang sein.`,
    };
  }
  if (rawDisplayText.length > MAX_DISPLAY_TEXT_LENGTH) {
    return {
      ok: false,
      hint: `Der Anzeigetext darf höchstens ${MAX_DISPLAY_TEXT_LENGTH} Zeichen lang sein.`,
    };
  }

  const displayText = rawDisplayText.trim();
  const link: LinkAttachment = {
    id: crypto.randomUUID(),
    type: "link",
    url,
  };
  if (displayText !== "") {
    link.displayText = displayText;
  }
  return { ok: true, value: link };
}

/**
 * Validiert eine Code-Eingabe (Quelltext/Sprache) und erzeugt bei Erfolg ein
 * CodeAttachment. Der Quelltext wird UNVERÄNDERT (ungetrimmt) gespeichert; nur
 * für die Leer-Prüfung wird getrimmt. Die Sprachangabe wird getrimmt und – wenn
 * leer – weggelassen (Requirements 3.1–3.5).
 */
export function validateCode(
  source: string,
  rawLanguage: string,
): ValidationResult<CodeAttachment> {
  if (source.trim().length < 1) {
    return { ok: false, hint: "Quelltext ist erforderlich." };
  }
  if (source.length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      hint: `Der Quelltext darf höchstens ${MAX_CODE_LENGTH} Zeichen umfassen.`,
    };
  }

  const language = rawLanguage.trim();
  if (language.length > MAX_LANGUAGE_LENGTH) {
    return {
      ok: false,
      hint: `Die Sprachangabe darf höchstens ${MAX_LANGUAGE_LENGTH} Zeichen lang sein.`,
    };
  }

  const code: CodeAttachment = {
    id: crypto.randomUUID(),
    type: "code",
    source,
  };
  if (language !== "") {
    code.language = language;
  }
  return { ok: true, value: code };
}

/**
 * Validiert die Metadaten einer Bilddatei (Typ/Grösse/Bildunterschrift). Die
 * Base64-Konvertierung der Bytes geschieht in der Komponente (FileReader);
 * diese Funktion prüft nur die reinen, testbaren Regeln. Die Grenze von
 * 2 000 000 Byte ist inklusiv (Requirements 4.1–4.4, 4.6).
 */
export function validateImageMeta(meta: {
  mimeType: string;
  byteSize: number;
  caption: string;
}): ValidationResult<{ mimeType: ImageAttachment["mimeType"]; caption?: string }> {
  const { mimeType, byteSize, caption } = meta;

  if (!isAllowedImageMime(mimeType)) {
    return {
      ok: false,
      hint: "Nur Bilder vom Typ PNG, JPEG, GIF oder WEBP werden unterstützt.",
    };
  }
  if (byteSize === 0) {
    return { ok: false, hint: "Die Datei ist leer." };
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      hint: `Das Bild darf höchstens ${MAX_IMAGE_BYTES} Byte gross sein.`,
    };
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    return {
      ok: false,
      hint: `Die Bildunterschrift darf höchstens ${MAX_CAPTION_LENGTH} Zeichen lang sein.`,
    };
  }

  const result: { mimeType: ImageAttachment["mimeType"]; caption?: string } = {
    mimeType,
  };
  if (caption !== "") {
    result.caption = caption;
  }
  return { ok: true, value: result };
}

/** Prüft, ob ein MIME-Typ in der erlaubten Bildmenge liegt (Type Guard). */
function isAllowedImageMime(
  mimeType: string,
): mimeType is ImageAttachment["mimeType"] {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mimeType);
}

/**
 * Hängt einen Anhang als letztes Element des Tages an, solange die Anzahl der
 * Anhänge unter MAX_ATTACHMENTS_PER_DAY liegt. Ist das Limit erreicht, bleibt
 * der Tag unverändert und es wird ein Hinweis (Schweizer Hochdeutsch)
 * zurückgegeben. Bei Erfolg entsteht ein neuer DayEntry; die bestehenden
 * Anhänge bleiben in ihrer Reihenfolge erhalten (Requirements 1.4, 1.6, 1.7).
 */
export function addAttachment(
  day: DayEntry,
  attachment: Attachment,
): ValidationResult<DayEntry> {
  const attachments = day.attachments ?? [];

  if (attachments.length >= MAX_ATTACHMENTS_PER_DAY) {
    return {
      ok: false,
      hint: `Pro Tag sind höchstens ${MAX_ATTACHMENTS_PER_DAY} Anhänge möglich.`,
    };
  }

  return {
    ok: true,
    value: { ...day, attachments: [...attachments, attachment] },
  };
}

/**
 * Entfernt genau den Anhang mit der gegebenen id; die übrigen Anhänge bleiben
 * in unveränderter Reihenfolge erhalten. Als Basis dient `day.attachments ?? []`.
 * Gibt einen neuen DayEntry zurück (Requirement 1.3).
 */
export function removeAttachment(day: DayEntry, attachmentId: string): DayEntry {
  const attachments = day.attachments ?? [];
  return {
    ...day,
    attachments: attachments.filter((a) => a.id !== attachmentId),
  };
}
