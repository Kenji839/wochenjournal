import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  addAttachment,
  removeAttachment,
  validateLink,
  validateCode,
  validateImageMeta,
  MAX_ATTACHMENTS_PER_DAY,
  MAX_URL_LENGTH,
  MAX_DISPLAY_TEXT_LENGTH,
  MAX_CODE_LENGTH,
  MAX_LANGUAGE_LENGTH,
  MAX_CAPTION_LENGTH,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME,
} from "@/lib/attachments";
import type {
  Attachment,
  CodeAttachment,
  DayEntry,
  ImageAttachment,
  LinkAttachment,
} from "@/types/journal";

const RUNS = 100;

// ---------------------------------------------------------------------------
// Hilfs-Arbitraries für gültige Anhänge (Reihenfolge-/Limit-Properties brauchen
// keine bestimmten Inhalte, nur wohlgeformte Anhang-Objekte).
// ---------------------------------------------------------------------------

const linkAttArb: fc.Arbitrary<Attachment> = fc
  .record({
    id: fc.string(),
    url: fc.webUrl(),
    displayText: fc.option(fc.string(), { nil: undefined }),
  })
  .map(({ id, url, displayText }): Attachment => {
    const link: LinkAttachment = { id, type: "link", url };
    if (displayText !== undefined) link.displayText = displayText;
    return link;
  });

const codeAttArb: fc.Arbitrary<Attachment> = fc
  .record({
    id: fc.string(),
    source: fc.string({ minLength: 1 }),
    language: fc.option(fc.string(), { nil: undefined }),
  })
  .map(({ id, source, language }): Attachment => {
    const code: CodeAttachment = { id, type: "code", source };
    if (language !== undefined) code.language = language;
    return code;
  });

const imageAttArb: fc.Arbitrary<Attachment> = fc
  .record({
    id: fc.string(),
    data: fc.string(),
    mimeType: fc.constantFrom(...ALLOWED_IMAGE_MIME),
    filename: fc.string(),
    caption: fc.option(fc.string(), { nil: undefined }),
  })
  .map(({ id, data, mimeType, filename, caption }): Attachment => {
    const image: ImageAttachment = { id, type: "image", data, mimeType, filename };
    if (caption !== undefined) image.caption = caption;
    return image;
  });

const attachmentArb: fc.Arbitrary<Attachment> = fc.oneof(
  linkAttArb,
  codeAttArb,
  imageAttArb,
);

/** Erzeugt einen Tageseintrag mit den gegebenen Anhängen (übrige Felder neutral). */
function baseDay(attachments: Attachment[]): DayEntry {
  return { weekday: "montag", stichworte: "", text: "", attachments };
}

describe("attachments pure logic – property based", () => {
  // Feature: day-attachments, Property 1: Hinzufügen erhält Reihenfolge und begrenzt auf 10
  // Validates: Requirements 1.4, 1.6, 1.7
  it("Property 1: addAttachment hängt hinten an, bewahrt Reihenfolge und begrenzt auf MAX_ATTACHMENTS_PER_DAY", () => {
    fc.assert(
      fc.property(
        fc.array(attachmentArb, { maxLength: 15 }),
        (attachments) => {
          let day = baseDay([]);
          const accepted: Attachment[] = [];

          for (const att of attachments) {
            const before = day.attachments ?? [];
            const result = addAttachment(day, att);

            if (before.length >= MAX_ATTACHMENTS_PER_DAY) {
              // Limit erreicht: abgelehnt, Tag bleibt unverändert.
              expect(result.ok).toBe(false);
              // day wird nicht weitergereicht → bleibt unverändert.
            } else {
              expect(result.ok).toBe(true);
              if (result.ok) {
                // Akzeptierter Anhang ist das letzte Element.
                expect(result.value.attachments).toEqual([...before, att]);
                expect(
                  result.value.attachments?.[before.length],
                ).toBe(att);
                accepted.push(att);
                day = result.value;
              }
            }
          }

          const finalAttachments = day.attachments ?? [];
          // Nie mehr als 10; genau min(N, 10) wurden akzeptiert.
          expect(finalAttachments.length).toBeLessThanOrEqual(
            MAX_ATTACHMENTS_PER_DAY,
          );
          expect(finalAttachments.length).toBe(
            Math.min(attachments.length, MAX_ATTACHMENTS_PER_DAY),
          );
          // Einfügereihenfolge bleibt erhalten (erste 10 in Reihenfolge).
          expect(finalAttachments).toEqual(accepted);
          expect(accepted).toEqual(
            attachments.slice(0, MAX_ATTACHMENTS_PER_DAY),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 2: Entfernen trifft genau das Ziel, bewahrt Reihenfolge
  // Validates: Requirements 1.3
  it("Property 2: removeAttachment entfernt genau die Ziel-id und bewahrt die Reihenfolge der übrigen", () => {
    fc.assert(
      fc.property(
        fc.array(attachmentArb, { maxLength: 12 }),
        fc.integer({ min: 0, max: 100 }),
        (rawAttachments, pick) => {
          // Eindeutige ids erzwingen, damit "genau ein Ziel" wohldefiniert ist.
          const attachments = rawAttachments.map(
            (a, i): Attachment => ({ ...a, id: `att-${i}` }),
          );
          const day = baseDay(attachments);

          if (attachments.length === 0) {
            // Entfernen aus leerem Tag liefert weiterhin eine leere Liste.
            const result = removeAttachment(day, "att-0");
            expect(result.attachments).toEqual([]);
            return;
          }

          const idx = pick % attachments.length;
          const targetId = attachments[idx].id;
          const result = removeAttachment(day, targetId);

          // Genau das Ziel fehlt, übrige in unveränderter Reihenfolge.
          const expected = attachments.filter((_, i) => i !== idx);
          expect(result.attachments).toEqual(expected);
          expect(
            result.attachments?.some((a) => a.id === targetId),
          ).toBe(false);

          // Eine nicht vorhandene id lässt die Liste unverändert.
          const untouched = removeAttachment(day, "nicht-vorhanden");
          expect(untouched.attachments).toEqual(attachments);
        },
      ),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 3: Link-Validierung
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4
  it("Property 3: validateLink akzeptiert genau bei korrektem Präfix und gültigen Längen", () => {
    // URLs inkl. Grenzlängen, falschem Präfix, Whitespace-only und umschliessenden Leerzeichen.
    const urlArb = fc.oneof(
      // Gültiges Präfix, beliebiger Rest.
      fc
        .tuple(fc.constantFrom("http://", "https://"), fc.string())
        .map(([prefix, rest]) => prefix + rest),
      // Grenzlänge rund um 2048 (getrimmt).
      fc
        .integer({ min: MAX_URL_LENGTH - 6, max: MAX_URL_LENGTH + 6 })
        .map((n) => "https://" + "a".repeat(Math.max(0, n - 8))),
      // Gültiges Präfix mit umschliessenden Leerzeichen.
      fc
        .tuple(fc.constantFrom("http://", "https://"), fc.string())
        .map(([prefix, rest]) => "   " + prefix + rest + "   "),
      // Falsches Präfix.
      fc.string().map((s) => "ftp://" + s),
      fc.string(),
      // Whitespace-only / leer.
      fc.constantFrom("", "   ", "\t", " \n "),
    );

    const displayArb = fc.oneof(
      fc.string(),
      // Grenzlänge rund um 200.
      fc
        .integer({ min: MAX_DISPLAY_TEXT_LENGTH - 5, max: MAX_DISPLAY_TEXT_LENGTH + 5 })
        .map((n) => "x".repeat(n)),
    );

    fc.assert(
      fc.property(urlArb, displayArb, (rawUrl, rawDisplayText) => {
        const url = rawUrl.trim();
        const expected =
          (url.startsWith("http://") || url.startsWith("https://")) &&
          url.length <= MAX_URL_LENGTH &&
          rawDisplayText.length <= MAX_DISPLAY_TEXT_LENGTH;

        const result = validateLink(rawUrl, rawDisplayText);
        expect(result.ok).toBe(expected);

        if (result.ok) {
          // Bei Erfolg wird die getrimmte URL gespeichert.
          expect(result.value.type).toBe("link");
          expect(result.value.url).toBe(url);
        } else {
          // Bei Misserfolg gibt es einen Hinweis und keinen Anhang.
          expect(typeof result.hint).toBe("string");
          expect(result.hint.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 4: Code-Validierung und unveränderte Quelltextspeicherung
  // Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
  it("Property 4: validateCode akzeptiert nach Regeln und speichert source zeichengleich", () => {
    const sourceArb = fc.oneof(
      fc.string(),
      // Leer / nur Whitespace.
      fc.constantFrom("", "   ", "\n\t ", "  \n  "),
      // Mit umschliessenden Leerzeichen (getrimmt nicht leer).
      fc.string({ minLength: 1, maxLength: 40 }).map((s) => "  " + s + "  "),
      // Mit Zeilenumbrüchen / Einrückungen.
      fc.string().map((s) => s + "\n    eingerueckt\n"),
      // Grenzlänge rund um 100 000 (ungetrimmt).
      fc
        .integer({ min: MAX_CODE_LENGTH - 4, max: MAX_CODE_LENGTH + 4 })
        .map((n) => "a".repeat(n)),
    );

    const languageArb = fc.oneof(
      fc.string(),
      fc.constantFrom("", "  ", "ts", "typescript"),
      // Grenzlänge rund um 30 (getrimmt).
      fc
        .integer({ min: MAX_LANGUAGE_LENGTH - 4, max: MAX_LANGUAGE_LENGTH + 4 })
        .map((n) => "x".repeat(n)),
      // Getrimmt knapp an der Grenze, mit umschliessenden Leerzeichen.
      fc
        .integer({ min: MAX_LANGUAGE_LENGTH - 2, max: MAX_LANGUAGE_LENGTH + 2 })
        .map((n) => "  " + "x".repeat(n) + "  "),
    );

    fc.assert(
      fc.property(sourceArb, languageArb, (source, rawLanguage) => {
        const expected =
          source.trim().length >= 1 &&
          source.length <= MAX_CODE_LENGTH &&
          rawLanguage.trim().length <= MAX_LANGUAGE_LENGTH;

        const result = validateCode(source, rawLanguage);
        expect(result.ok).toBe(expected);

        if (result.ok) {
          expect(result.value.type).toBe("code");
          // Quelltext exakt zeichengleich (kein Trim, keine Kürzung).
          expect(result.value.source).toBe(source);
        } else {
          expect(typeof result.hint).toBe("string");
          expect(result.hint.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 5: Bild-Metadaten-Validierung
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6
  it("Property 5: validateImageMeta akzeptiert nur erlaubte MIME-Typen, gültige Grösse und Bildunterschrift", () => {
    const mimeArb = fc.oneof(
      fc.constantFrom(...ALLOWED_IMAGE_MIME),
      // Nicht erlaubte MIME-Typen inkl. leer.
      fc.constantFrom(
        "image/bmp",
        "image/svg+xml",
        "image/tiff",
        "text/plain",
        "application/pdf",
        "",
      ),
    );

    const byteArb = fc.oneof(
      // Kleine Werte inkl. 0 und 1.
      fc.integer({ min: 0, max: 5 }),
      // Grenze rund um 2 000 000 (inklusiv).
      fc.integer({ min: MAX_IMAGE_BYTES - 5, max: MAX_IMAGE_BYTES + 5 }),
      // Breiter Bereich.
      fc.integer({ min: 0, max: 3_000_000 }),
    );

    const captionArb = fc.oneof(
      fc.string(),
      // Grenzlänge rund um 200.
      fc
        .integer({ min: MAX_CAPTION_LENGTH - 5, max: MAX_CAPTION_LENGTH + 5 })
        .map((n) => "x".repeat(n)),
    );

    fc.assert(
      fc.property(mimeArb, byteArb, captionArb, (mimeType, byteSize, caption) => {
        const allowed = (ALLOWED_IMAGE_MIME as readonly string[]).includes(
          mimeType,
        );
        const expected =
          allowed &&
          byteSize >= 1 &&
          byteSize <= MAX_IMAGE_BYTES &&
          caption.length <= MAX_CAPTION_LENGTH;

        const result = validateImageMeta({ mimeType, byteSize, caption });
        expect(result.ok).toBe(expected);

        if (result.ok) {
          expect(result.value.mimeType).toBe(mimeType);
        } else {
          expect(typeof result.hint).toBe("string");
          expect(result.hint.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
