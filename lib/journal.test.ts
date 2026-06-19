import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  composeJournal,
  displayedJournal,
  journalFileName,
  withJournalText,
  withoutJournalText,
} from "@/lib/journal";
import type {
  Attachment,
  CodeAttachment,
  DayEntry,
  ImageAttachment,
  LinkAttachment,
  WeekJournal,
} from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

const RUNS = 100;

/** Arbitrary für einen mehrzeiligen Quelltext (inkl. Zeilenumbrüchen/Einrückungen). */
const multilineArbitrary: fc.Arbitrary<string> = fc
  .array(fc.string(), { maxLength: 5 })
  .map((lines) => lines.join("\n"));

/** Erlaubte Bild-MIME-Typen gemäss Datenmodell. */
const mimeTypeArbitrary: fc.Arbitrary<ImageAttachment["mimeType"]> =
  fc.constantFrom("image/png", "image/jpeg", "image/gif", "image/webp");

/** Link-Anhang: URL (http/https) und optionaler Anzeigetext. */
const linkAttachmentArbitrary: fc.Arbitrary<LinkAttachment> = fc
  .record({
    id: fc.uuid(),
    url: fc.webUrl(),
    displayText: fc.option(fc.string(), { nil: undefined }),
  })
  .map(({ id, url, displayText }) => {
    const link: LinkAttachment = { id, type: "link", url };
    if (displayText !== undefined) link.displayText = displayText;
    return link;
  });

/** Code-Anhang: unveränderter Quelltext und optionale Sprachangabe. */
const codeAttachmentArbitrary: fc.Arbitrary<CodeAttachment> = fc
  .record({
    id: fc.uuid(),
    source: multilineArbitrary,
    language: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
      nil: undefined,
    }),
  })
  .map(({ id, source, language }) => {
    const code: CodeAttachment = { id, type: "code", source };
    if (language !== undefined) code.language = language;
    return code;
  });

/** Bild-Anhang: Base64-Daten, MIME-Typ, Dateiname und optionale Bildunterschrift. */
const imageAttachmentArbitrary: fc.Arbitrary<ImageAttachment> = fc
  .record({
    id: fc.uuid(),
    data: fc.base64String(),
    mimeType: mimeTypeArbitrary,
    filename: fc.string(),
    caption: fc.option(fc.string(), { nil: undefined }),
  })
  .map(({ id, data, mimeType, filename, caption }) => {
    const image: ImageAttachment = { id, type: "image", data, mimeType, filename };
    if (caption !== undefined) image.caption = caption;
    return image;
  });

/** Beliebiger Tagesanhang (Link/Code/Bild). */
const attachmentArbitrary: fc.Arbitrary<Attachment> = fc.oneof(
  linkAttachmentArbitrary,
  codeAttachmentArbitrary,
  imageAttachmentArbitrary,
);

/**
 * Test-lokale Wiedergabe eines Anhangs gemäss Export-Kontrakt (Design):
 * - Link: "Anzeigetext (url)", falls ein vom URL abweichender Anzeigetext
 *   vorhanden ist, sonst nur "url".
 * - Code: optionale Sprachzeile "Code (lang):" vorangestellt, danach der
 *   Quelltext unverändert.
 * - Bild: Platzhalter "[Bild: <Bildunterschrift|Dateiname>]".
 */
function renderExpected(a: Attachment): string {
  switch (a.type) {
    case "link":
      return a.displayText && a.displayText !== a.url
        ? `${a.displayText} (${a.url})`
        : a.url;
    case "code":
      return a.language ? `Code (${a.language}):\n${a.source}` : a.source;
    case "image":
      return `[Bild: ${a.caption ? a.caption : a.filename}]`;
  }
}

/** Arbitrary für einen einzelnen Tageseintrag eines gegebenen Wochentags. */
function dayArbitrary(weekday: DayEntry["weekday"]): fc.Arbitrary<DayEntry> {
  return fc.record({
    weekday: fc.constant(weekday),
    stichworte: fc.string(),
    text: fc.string(),
    // Tagesanhänge in Reihenfolge (0–10) für Komposition/Export-Properties.
    attachments: fc.array(attachmentArbitrary, { maxLength: 10 }),
  });
}

/** Arbitrary für die fünf Tageseinträge (Mo–Fr) in der Reihenfolge von WEEKDAYS. */
const daysArbitrary: fc.Arbitrary<DayEntry[]> = fc.tuple(
  ...WEEKDAYS.map(({ key }) => dayArbitrary(key)),
);

/** Arbitrary für eine vollständige Woche inkl. optionaler Überschreibung. */
const weekArbitrary: fc.Arbitrary<WeekJournal> = fc.record({
  id: fc.string(),
  kw: fc.integer({ min: 1, max: 53 }),
  jahr: fc.integer({ min: 1000, max: 9999 }),
  days: daysArbitrary,
  reflexion: fc.string(),
  // Deckt fehlend (undefined), leer/whitespace und echten Inhalt ab.
  journalText: fc.option(fc.string(), { nil: undefined }),
  // Gültiger ISO-String aus einem begrenzten Zeitstempel (vermeidet Invalid Date).
  updatedAt: fc
    .integer({ min: 0, max: 4_102_444_800_000 })
    .map((ms) => new Date(ms).toISOString()),
});

describe("journal pure logic – property based", () => {
  // Feature: journal-redesign-edit, Property 1
  // Validates: Requirements 2.2, 2.4, 6.4, 7.1
  it("Property 1: Override-Präzedenz – displayedJournal nutzt nicht-leere Überschreibung, sonst composeJournal", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const result = displayedJournal(week);
        const hatUeberschreibung =
          typeof week.journalText === "string" &&
          week.journalText.trim() !== "";

        if (hatUeberschreibung) {
          expect(result).toBe(week.journalText);
        } else {
          expect(result).toBe(composeJournal(week));
        }
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: journal-redesign-edit, Property 2
  // Validates: Requirements 2.3, 2.8, 2.10
  it("Property 2: Überschreibungs-Lebenszyklus – withJournalText/withoutJournalText setzen und entfernen korrekt", () => {
    fc.assert(
      fc.property(weekArbitrary, fc.string(), (week, value) => {
        const gesetzt = withJournalText(week, value);

        if (value.trim() !== "") {
          // Nicht-leerer Wert: Überschreibung wird unverändert übernommen.
          expect(gesetzt.journalText).toBe(value);
        } else {
          // Leerer/whitespace-Wert: keine Überschreibung.
          expect(gesetzt.journalText).toBeUndefined();
        }

        // withoutJournalText entfernt die Überschreibung immer.
        const entfernt = withoutJournalText(gesetzt);
        expect(entfernt.journalText).toBeUndefined();

        // Nach dem Entfernen entspricht der angezeigte Text dem abgeleiteten Text.
        expect(displayedJournal(entfernt)).toBe(composeJournal(entfernt));
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: journal-redesign-edit, Property 6
  // Validates: Requirements 7.2
  it("Property 6: Dateiname-Formatierung – KW zweistellig (führende Null), Jahr vierstellig", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const name = journalFileName(week);
        const kw = String(week.kw).padStart(2, "0");
        const jahr = String(week.jahr).padStart(4, "0");

        expect(name).toBe(`arbeitsjournal-kw${kw}-${jahr}.txt`);
        expect(name).toMatch(/^arbeitsjournal-kw\d{2}-\d{4}\.txt$/);
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 7: Komposition gibt Anhänge nach dem Tagesabsatz in Reihenfolge aus
  // Validates: Requirements 6.1, 6.6
  it("Property 7: Anhänge erscheinen nach dem Tagesabsatz in gespeicherter Reihenfolge, ohne Platzhalter bei leeren Tagen", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const out = composeJournal(week);

        // Erwarteter Tagesblock: je Tag die Tageszeile, gefolgt von den
        // Anhängen in gespeicherter Reihenfolge. Tage ohne Anhänge tragen
        // ausschliesslich ihre Tageszeile bei (kein Platzhalter).
        const daysBlock = WEEKDAYS.map(({ key, label }) => {
          const eintrag = week.days.find((d) => d.weekday === key);
          const text = eintrag?.text.trim();
          const zeile = `${label}: ${text ? text : "–"}`;
          const anhaenge = (eintrag?.attachments ?? []).map(renderExpected);
          return [zeile, ...anhaenge].join("\n");
        }).join("\n");

        // Der zusammenhängende Block muss exakt so vorkommen: Das beweist die
        // Platzierung nach dem Absatz, die gespeicherte Reihenfolge und – da der
        // Block für leere Tage nur die Tageszeile enthält – dass kein Platzhalter
        // eingefügt wird (Requirement 6.6).
        expect(out).toContain(daysBlock);
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 8: Export-Formatierung je Anhangtyp
  // Validates: Requirements 6.2, 6.3, 6.4, 6.5, 2.5
  it("Property 8: Jeder Anhang wird typgerecht im Export formatiert", () => {
    fc.assert(
      fc.property(weekArbitrary, (week) => {
        const out = composeJournal(week);

        for (const day of week.days) {
          for (const anhang of day.attachments ?? []) {
            switch (anhang.type) {
              case "link": {
                // Anzeigetext (url), falls abweichender Anzeigetext vorhanden,
                // sonst nur die url (Requirements 6.2, 6.3, 2.5).
                const erwartet =
                  anhang.displayText && anhang.displayText !== anhang.url
                    ? `${anhang.displayText} (${anhang.url})`
                    : anhang.url;
                expect(out).toContain(erwartet);
                break;
              }
              case "code": {
                // Quelltext zeichengleich als Teilstring; bei Sprachangabe eine
                // vorangestellte Sprachzeile (Requirement 6.4, 3.5).
                expect(out).toContain(anhang.source);
                if (anhang.language) {
                  expect(out).toContain(
                    `Code (${anhang.language}):\n${anhang.source}`,
                  );
                }
                break;
              }
              case "image": {
                // Erkennbarer Platzhalter mit Bildunterschrift, sonst Dateiname
                // (Requirement 6.5).
                expect(out).toContain(
                  `[Bild: ${anhang.caption ? anhang.caption : anhang.filename}]`,
                );
                break;
              }
            }
          }
        }
      }),
      { numRuns: RUNS },
    );
  });
});
