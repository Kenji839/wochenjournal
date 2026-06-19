import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

import {
  convertToStorageFormat,
  convertWeekToStorageFormat,
  renderCode,
  renderLink,
  uploadJournal,
  type StorageWeek,
} from "@/lib/confluence";
import type {
  Attachment,
  CodeAttachment,
  DayEntry,
  ImageAttachment,
  LinkAttachment,
} from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

// Anzahl Iterationen je Property (Konvention aus lib/journal.test.ts).
const RUNS = 100;

// ---------------------------------------------------------------------------
// Hilfsfunktionen: XHTML-Entmaskierung (Round-Trip-Pruefung)
// ---------------------------------------------------------------------------

/**
 * Kehrt escapeXml um (& zuletzt, damit erzeugte Entities nicht fehlinterpretiert
 * werden): &lt; -> <, &gt; -> >, danach &amp; -> &.
 */
function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Kehrt escapeAttr um (zusaetzlich &quot; -> "). & wird wiederum zuletzt
 * entmaskiert.
 */
function unescapeAttr(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Struktureller Well-Formedness-Checker (keine XML-Parser-Dependency)
// ---------------------------------------------------------------------------

/** Prueft, dass jedes & eine legale Entity (&amp; &lt; &gt; &quot;) einleitet. */
function legalEntitiesOnly(text: string): boolean {
  let index = 0;
  for (;;) {
    const at = text.indexOf("&", index);
    if (at === -1) return true;
    const rest = text.slice(at);
    if (
      rest.startsWith("&amp;") ||
      rest.startsWith("&lt;") ||
      rest.startsWith("&gt;") ||
      rest.startsWith("&quot;")
    ) {
      index = at + 1;
    } else {
      return false;
    }
  }
}

/** Textknoten: keine rohen < oder >, nur legale Entities ( " ist im Text erlaubt). */
function textOk(text: string): boolean {
  if (text.includes("<") || text.includes(">")) return false;
  return legalEntitiesOnly(text);
}

/** Attributwert: keine rohen < > (rohes " kann es nicht geben), nur legale Entities. */
function attrValueOk(value: string): boolean {
  if (value.includes("<") || value.includes(">")) return false;
  return legalEntitiesOnly(value);
}

/**
 * Struktureller Wohlgeformtheits-Check: balancierte/korrekt geschachtelte Tags,
 * mit " gequotete Attributwerte und ausschliesslich legale Entities. Bewusst
 * minimal und ohne externe XML-Bibliothek.
 */
function checkWellFormed(xml: string): boolean {
  const nameRe = /[A-Za-z][A-Za-z0-9:-]*/y;
  const stack: string[] = [];
  let i = 0;
  const n = xml.length;

  while (i < n) {
    if (xml[i] === "<") {
      if (xml[i + 1] === "/") {
        // Schliessendes Tag.
        i += 2;
        nameRe.lastIndex = i;
        const match = nameRe.exec(xml);
        if (!match) return false;
        const name = match[0];
        i = nameRe.lastIndex;
        if (xml[i] !== ">") return false;
        i += 1;
        if (stack.pop() !== name) return false;
      } else {
        // Oeffnendes oder selbstschliessendes Tag.
        i += 1;
        nameRe.lastIndex = i;
        const match = nameRe.exec(xml);
        if (!match) return false;
        const name = match[0];
        i = nameRe.lastIndex;

        for (;;) {
          while (i < n && xml[i] === " ") i += 1;
          if (i >= n) return false;
          if (xml[i] === ">") {
            i += 1;
            stack.push(name);
            break;
          }
          if (xml[i] === "/") {
            if (xml[i + 1] !== ">") return false;
            i += 2; // selbstschliessend: nicht auf den Stack legen
            break;
          }
          // Attribut: name="value"
          nameRe.lastIndex = i;
          const attr = nameRe.exec(xml);
          if (!attr) return false;
          i = nameRe.lastIndex;
          if (xml[i] !== "=") return false;
          i += 1;
          if (xml[i] !== '"') return false;
          i += 1;
          let value = "";
          while (i < n && xml[i] !== '"') {
            value += xml[i];
            i += 1;
          }
          if (i >= n) return false; // unterminierter Attributwert
          i += 1; // schliessendes " konsumieren
          if (!attrValueOk(value)) return false;
        }
      }
    } else {
      // Textknoten bis zum naechsten <
      let text = "";
      while (i < n && xml[i] !== "<") {
        text += xml[i];
        i += 1;
      }
      if (!textOk(text)) return false;
    }
  }

  return stack.length === 0;
}

/** Kapselt Anhang-XHTML in ein Wurzelelement mit ac:/ri:-Namespace-Deklarationen. */
function wrapWithNamespaces(body: string): string {
  return `<root xmlns:ac="urn:ac" xmlns:ri="urn:ri">${body}</root>`;
}

// ---------------------------------------------------------------------------
// Generatoren (smart constrained): Sonderzeichen & < > " sowie Zeilenumbrueche
// ---------------------------------------------------------------------------

// Sonderzeichen, die das Escaping ausloesen, plus etwas Fuell-/Nicht-ASCII.
// Bewusst OHNE "*", damit Strings ohne Fett-Markierung entstehen, und OHNE
// Buchstaben, die Wochentags-Labels bilden koennten (Property 11).
const SPECIAL_CHARS = ["&", "<", ">", '"'] as const;
const FILLER_CHARS = ["a", "Z", "ä", "1", "/", ":", "%", "-", "_", "."] as const;

const trickyChar = fc.constantFrom(...SPECIAL_CHARS, ...FILLER_CHARS);

/** Einzeiliger String mit Sonderzeichen, ohne "*" und ohne Zeilenumbruch. */
const trickyString: fc.Arbitrary<string> = fc
  .array(trickyChar, { maxLength: 30 })
  .map((chars) => chars.join(""));

const codeChar = fc.constantFrom(...SPECIAL_CHARS, ...FILLER_CHARS, "\n", "\t");

/** Mehrzeiliger Quelltext inkl. Zeilenumbruechen/Einrueckungen und Sonderzeichen. */
const codeString: fc.Arbitrary<string> = fc
  .array(codeChar, { maxLength: 40 })
  .map((chars) => chars.join(""));

/** Mehrzeiliger Journaltext (1–6 Zeilen ohne "*"), via "\n" verbunden. */
const multiLineString: fc.Arbitrary<string> = fc
  .array(trickyString, { minLength: 1, maxLength: 6 })
  .map((lines) => lines.join("\n"));

// ---------------------------------------------------------------------------
// Property 9 (Task 7.3): renderLink erzeugt wohlgeformten Anker mit exaktem Ziel
// ---------------------------------------------------------------------------

const linkArbitrary: fc.Arbitrary<LinkAttachment> = fc.record({
  type: fc.constant("link" as const),
  id: fc.string(),
  url: trickyString,
  displayText: fc.option(trickyString, { nil: undefined }),
});

describe("confluence – Link-Konvertierung (Property 9)", () => {
  // Feature: day-attachments, Property 9: Link-Konvertierung erzeugt wohlgeformten Anker mit exaktem Ziel
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
  it("Property 9: renderLink – genau ein Anker, href zeichengetreu, sichtbarer Text korrekt, keine rohen Sonderzeichen", () => {
    fc.assert(
      fc.property(linkArbitrary, (link) => {
        const out = renderLink(link);

        // Genau ein <a …> … </a>.
        expect((out.match(/<a /g) ?? []).length).toBe(1);
        expect((out.match(/<\/a>/g) ?? []).length).toBe(1);

        const match = /^<a href="([^"]*)">([\s\S]*)<\/a>$/.exec(out);
        expect(match).not.toBeNull();
        const hrefRaw = match![1];
        const textRaw = match![2];

        // href nach Entmaskierung zeichengleich zur URL (keine Kuerzung/Umschreibung).
        expect(unescapeAttr(hrefRaw)).toBe(link.url);

        // Sichtbarer Text = Anzeigetext, sonst URL.
        const expectedText = link.displayText ?? link.url;
        expect(unescapeXml(textRaw)).toBe(expectedText);

        // Keine rohen Sonderzeichen: Attribut & < > " ; Text & < >.
        expect(attrValueOk(hrefRaw)).toBe(true);
        expect(textOk(textRaw)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 (Task 7.4): renderCode ist verlustfrei mit korrektem Sprachparameter
// ---------------------------------------------------------------------------

const codeArbitrary: fc.Arbitrary<CodeAttachment> = fc.record({
  type: fc.constant("code" as const),
  id: fc.string(),
  source: codeString,
  language: fc.option(trickyString, { nil: undefined }),
});

describe("confluence – Code-Konvertierung (Property 10)", () => {
  // Feature: day-attachments, Property 10: Code-Konvertierung ist verlustfrei (Round-Trip) mit korrektem Sprachparameter
  // Validates: Requirements 8.1, 8.2, 8.3, 8.4
  it("Property 10: renderCode – code-Makro, Body zeichengleich zu source, language-Parameter genau dann wenn vorhanden", () => {
    fc.assert(
      fc.property(codeArbitrary, (code) => {
        const out = renderCode(code);

        // Es ist ein Confluence-code-Makro.
        expect(out.startsWith('<ac:structured-macro ac:name="code">')).toBe(
          true,
        );

        // Body nach Entmaskierung zeichengleich zu source (inkl. Umbrueche/Einrueckung).
        const bodyMatch =
          /<ac:plain-text-body>([\s\S]*)<\/ac:plain-text-body>/.exec(out);
        expect(bodyMatch).not.toBeNull();
        expect(unescapeXml(bodyMatch![1])).toBe(code.source);

        // language-Parameter genau dann, wenn eine Sprachangabe vorhanden ist.
        const hasLanguage = out.includes(
          '<ac:parameter ac:name="language">',
        );
        expect(hasLanguage).toBe(code.language !== undefined);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Wochen-Arbitrary (fuer Property 11 und Property 15)
// ---------------------------------------------------------------------------

interface ImageSpec {
  t: "image";
  data: string;
  mimeType: ImageAttachment["mimeType"];
  filename: string;
  caption: string | undefined;
}
interface CodeSpec {
  t: "code";
  source: string;
  language: string | undefined;
}
interface LinkSpec {
  t: "link";
  url: string;
  displayText: string | undefined;
}
type AttachmentSpec = ImageSpec | CodeSpec | LinkSpec;

const mimeArbitrary = fc.constantFrom<ImageAttachment["mimeType"]>(
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
);

const imageSpec: fc.Arbitrary<AttachmentSpec> = fc.record({
  t: fc.constant("image" as const),
  data: fc.string(),
  mimeType: mimeArbitrary,
  filename: trickyString,
  caption: fc.option(trickyString, { nil: undefined }),
});
const codeSpec: fc.Arbitrary<AttachmentSpec> = fc.record({
  t: fc.constant("code" as const),
  source: codeString,
  language: fc.option(trickyString, { nil: undefined }),
});
const linkSpec: fc.Arbitrary<AttachmentSpec> = fc.record({
  t: fc.constant("link" as const),
  url: trickyString,
  displayText: fc.option(trickyString, { nil: undefined }),
});
const attachmentSpec = fc.oneof(imageSpec, codeSpec, linkSpec);

interface WeekSpec {
  kw: number;
  jahr: number;
  perDay: AttachmentSpec[][];
  texts: string[];
  reflexion: string;
}

const weekSpec: fc.Arbitrary<WeekSpec> = fc.record({
  kw: fc.integer({ min: 1, max: 53 }),
  jahr: fc.integer({ min: 1000, max: 9999 }),
  perDay: fc.tuple(
    ...WEEKDAYS.map(() => fc.array(attachmentSpec, { maxLength: 4 })),
  ),
  texts: fc.tuple(...WEEKDAYS.map(() => trickyString)),
  reflexion: fc.string(),
});

interface DayExpectation {
  label: string;
  labelParagraph: string;
  imageFilenames: string[];
}
interface BuiltWeek {
  input: StorageWeek;
  imageFilenames: Map<string, string>;
  /** Erwartete Upload-Dateinamen aller Bilder in globaler Reihenfolge (Tag fuer Tag). */
  expectedImageOrder: string[];
  perDay: DayExpectation[];
}

/**
 * Baut aus einem WeekSpec eine konkrete StorageWeek, die Map der je Anhang
 * vergebenen (eindeutigen, sonderzeichenfreien) Upload-Dateinamen sowie die
 * erwartete Reihenfolge/Zuordnung der Bild-Dateinamen.
 */
function buildWeek(spec: WeekSpec): BuiltWeek {
  const imageFilenames = new Map<string, string>();
  const expectedImageOrder: string[] = [];
  const days: DayEntry[] = [];
  const perDay: DayExpectation[] = [];

  WEEKDAYS.forEach(({ key, label }, dayIndex) => {
    const specs = spec.perDay[dayIndex];
    const attachments: Attachment[] = [];
    const dayImageFilenames: string[] = [];

    specs.forEach((s, attIndex) => {
      const id = `id_${dayIndex}_${attIndex}`;
      if (s.t === "image") {
        const uploadName = `upload_${dayIndex}_${attIndex}`;
        imageFilenames.set(id, uploadName);
        expectedImageOrder.push(uploadName);
        dayImageFilenames.push(uploadName);
        const att: ImageAttachment = {
          type: "image",
          id,
          data: s.data,
          mimeType: s.mimeType,
          filename: s.filename,
          caption: s.caption,
        };
        attachments.push(att);
      } else if (s.t === "code") {
        const att: CodeAttachment = {
          type: "code",
          id,
          source: s.source,
          language: s.language,
        };
        attachments.push(att);
      } else {
        const att: LinkAttachment = {
          type: "link",
          id,
          url: s.url,
          displayText: s.displayText,
        };
        attachments.push(att);
      }
    });

    const text = spec.texts[dayIndex];
    days.push({ weekday: key, stichworte: "", text, attachments });

    const trimmed = text.trim();
    const labelLine = `${label}: ${trimmed ? trimmed : "–"}`;
    perDay.push({
      label,
      labelParagraph: convertToStorageFormat(labelLine),
      imageFilenames: dayImageFilenames,
    });
  });

  return {
    input: { kw: spec.kw, jahr: spec.jahr, days, reflexion: spec.reflexion },
    imageFilenames,
    expectedImageOrder,
    perDay,
  };
}

const builtWeekArbitrary = weekSpec.map(buildWeek);

// ---------------------------------------------------------------------------
// Property 11 (Task 7.5): Bild-Makros liegen im richtigen Tagesabschnitt in Reihenfolge
// ---------------------------------------------------------------------------

describe("confluence – Bild-Makros je Tag (Property 11)", () => {
  // Feature: day-attachments, Property 11: Bild-Makros liegen im richtigen Tagesabschnitt in Reihenfolge
  // Validates: Requirements 8.5
  it("Property 11: convertWeekToStorageFormat – je Bild genau ein <ac:image> mit Upload-Dateiname, im richtigen Tag und in gespeicherter Reihenfolge", () => {
    fc.assert(
      fc.property(builtWeekArbitrary, (built) => {
        const out = convertWeekToStorageFormat(built.input, built.imageFilenames);

        // Genau ein <ac:image>-Makro je Bild; Dateinamen in globaler Reihenfolge.
        const macroRe =
          /<ac:image ac:alt="[^"]*"><ri:attachment ri:filename="([^"]*)" \/><\/ac:image>/g;
        const foundOrder = [...out.matchAll(macroRe)].map((m) => m[1]);
        expect(foundOrder).toEqual(built.expectedImageOrder);
        expect((out.match(/<ac:image /g) ?? []).length).toBe(
          built.expectedImageOrder.length,
        );

        // Abschnittsgrenzen je Tag ueber das (eindeutige) Label-Paragraph bestimmen.
        const labelIndices = built.perDay.map((d) =>
          out.indexOf(d.labelParagraph),
        );
        labelIndices.forEach((idx) => expect(idx).toBeGreaterThanOrEqual(0));

        built.perDay.forEach((day, dayIndex) => {
          const start = labelIndices[dayIndex];
          const end =
            dayIndex + 1 < labelIndices.length
              ? labelIndices[dayIndex + 1]
              : out.length;
          day.imageFilenames.forEach((filename) => {
            const pos = out.indexOf(`ri:filename="${filename}"`);
            expect(pos).toBeGreaterThan(start);
            expect(pos).toBeLessThan(end);
          });
        });
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 (Task 7.6): Gepaarte Fett-Markierung bleibt erhalten
// ---------------------------------------------------------------------------

// Tokens: einfache Woerter (keine "*") oder ein "**"-Marker.
const plainWord = fc
  .array(fc.constantFrom(..."abcXYZ ".split("")), { maxLength: 6 })
  .map((chars) => chars.join(""));
const boldToken = fc.oneof(plainWord, fc.constant("**"));

const boldLineArbitrary = fc
  .array(boldToken, { maxLength: 10 })
  .map((tokens) => ({
    line: tokens.join(""),
    markerCount: tokens.filter((t) => t === "**").length,
  }));

describe("confluence – gepaarte Fett-Markierung (Property 12)", () => {
  // Feature: day-attachments, Property 12: Gepaarte Fett-Markierung bleibt erhalten
  // Validates: Requirements 9.1
  it("Property 12: convertToStorageFormat – nur gepaarte ** werden zu <strong>, ungepaartes ** bleibt Literal", () => {
    fc.assert(
      fc.property(boldLineArbitrary, ({ line, markerCount }) => {
        const out = convertToStorageFormat(line);

        const pairs = Math.floor(markerCount / 2);
        expect((out.match(/<strong>/g) ?? []).length).toBe(pairs);
        expect((out.match(/<\/strong>/g) ?? []).length).toBe(pairs);

        // Uebrig bleibendes Literal "**" genau bei ungerader Markeranzahl.
        expect((out.match(/\*\*/g) ?? []).length).toBe(markerCount % 2);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13 (Task 7.7): Absatzstruktur pro Zeile
// ---------------------------------------------------------------------------

describe("confluence – Absatzstruktur (Property 13)", () => {
  // Feature: day-attachments, Property 13: Absatzstruktur pro Zeile
  // Validates: Requirements 9.2
  it("Property 13: convertToStorageFormat – jede nicht-leere Zeile ein <p>…</p>, jede leere Zeile ein <p />; Absatzanzahl = Zeilenanzahl", () => {
    fc.assert(
      fc.property(multiLineString, (text) => {
        const out = convertToStorageFormat(text);
        const lines = text.split("\n");
        const emptyCount = lines.filter((l) => l.trim() === "").length;
        const nonEmptyCount = lines.length - emptyCount;

        const emptyParagraphs = (out.match(/<p \/>/g) ?? []).length;
        const nonEmptyParagraphs = (out.match(/<p>/g) ?? []).length;

        expect(emptyParagraphs).toBe(emptyCount);
        expect(nonEmptyParagraphs).toBe(nonEmptyCount);
        expect(emptyParagraphs + nonEmptyParagraphs).toBe(lines.length);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14 (Task 7.8): Klartext-Maskierung ohne Doppel-Maskierung
// ---------------------------------------------------------------------------

// Einzeilig, ohne Fett-Markierung (trickyString enthaelt kein "*"), nicht leer.
const plainLineArbitrary = trickyString.filter((s) => s.trim() !== "");

describe("confluence – Klartext-Maskierung (Property 14)", () => {
  // Feature: day-attachments, Property 14: Klartext-Maskierung ohne Doppel-Maskierung
  // Validates: Requirements 9.3
  it("Property 14: convertToStorageFormat – Entmaskierung des Absatzinhalts ergibt die Originalzeile; kein &amp;amp;", () => {
    fc.assert(
      fc.property(plainLineArbitrary, (line) => {
        const out = convertToStorageFormat(line);

        const match = /^<p>([\s\S]*)<\/p>$/.exec(out);
        expect(match).not.toBeNull();
        const content = match![1];

        // Round-Trip: Entmaskierung ergibt exakt die Originalzeile.
        expect(unescapeXml(content)).toBe(line);

        // Keine Doppel-Maskierung.
        expect(out.includes("&amp;amp;")).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15 (Task 7.9): Wohlgeformtes XHTML fuer jeden Inhalt
// ---------------------------------------------------------------------------

describe("confluence – wohlgeformtes XHTML (Property 15)", () => {
  // Feature: day-attachments, Property 15: Wohlgeformtes XHTML fuer jeden Inhalt
  // Validates: Requirements 9.4
  it("Property 15: convertToStorageFormat erzeugt wohlgeformtes XHTML", () => {
    fc.assert(
      fc.property(multiLineString, (text) => {
        const out = convertToStorageFormat(text);
        expect(checkWellFormed(wrapWithNamespaces(out))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  // Feature: day-attachments, Property 15: Wohlgeformtes XHTML fuer jeden Inhalt
  // Validates: Requirements 9.4
  it("Property 15: convertWeekToStorageFormat erzeugt wohlgeformtes XHTML (inkl. Anhang-Makros)", () => {
    fc.assert(
      fc.property(builtWeekArbitrary, (built) => {
        const out = convertWeekToStorageFormat(built.input, built.imageFilenames);
        expect(checkWellFormed(wrapWithNamespaces(out))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 7.10: Regressions-Beispieltests (Beispiel, keine Property)
// Schreibt das bestehende convertToStorageFormat-Verhalten konkret fest.
// ---------------------------------------------------------------------------

describe("confluence – Regressionsanker convertToStorageFormat (Task 7.10)", () => {
  // Validates: Requirements 9.1
  it("wandelt gepaarte **…** in <strong>…</strong>", () => {
    expect(convertToStorageFormat("**fett**")).toBe(
      "<p><strong>fett</strong></p>",
    );
  });

  // Validates: Requirements 9.1
  it("laesst ein einzelnes, ungepaartes ** als Literal stehen", () => {
    expect(convertToStorageFormat("**eins")).toBe("<p>**eins</p>");
  });

  // Validates: Requirements 9.1
  it("paart das erste **…**-Paar und laesst das uebrige ** als Literal", () => {
    expect(convertToStorageFormat("** a ** b **")).toBe(
      "<p><strong> a </strong> b **</p>",
    );
  });

  // Validates: Requirements 9.2
  it("gibt eine Leerzeile als leeren Absatz <p /> aus", () => {
    expect(convertToStorageFormat("a\n\nb")).toBe("<p>a</p><p /><p>b</p>");
  });

  // Validates: Requirements 9.3
  it("maskiert & < > als &amp; &lt; &gt; ohne Doppel-Maskierung", () => {
    expect(convertToStorageFormat("a & b < c > d")).toBe(
      "<p>a &amp; b &lt; c &gt; d</p>",
    );
  });

  // Validates: Requirements 9.4
  it("erzeugt fuer einen mehrzeiligen Mischtext wohlgeformtes XHTML", () => {
    const out = convertToStorageFormat("**Titel**\n\nText & <Tag>");
    expect(out).toBe(
      "<p><strong>Titel</strong></p><p /><p>Text &amp; &lt;Tag&gt;</p>",
    );
    expect(checkWellFormed(wrapWithNamespaces(out))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integrationstests: uploadJournal (Bild-Upload-Sequenz)
// fetch und process.env werden gestubbt; es geht ueber das Netz kein Aufruf
// hinaus. Geprueft wird die Reihenfolge der Aufrufe (Seite sicherstellen → alle
// Bilder hochladen → Body mit Bild-Makros) sowie der Abbruch bei Fehler.
// ---------------------------------------------------------------------------

// Sentinel-Zugangsdaten: bewusst eindeutig, damit Tests beweisen koennen, dass
// sie niemals in Fehlermeldungen auftauchen.
const SECRET_USER = "SECRET_USER_VALUE";
const SECRET_PAT = "SECRET_PAT_VALUE";
const SECRET_BASE_URL = "https://confluence.example.test";
const SECRET_SPACE = "SECRETSPACE";
const ROOT_PAGE_ID = "999000";
const PAGE_ID = "777";

/** Aufgezeichneter fetch-Aufruf (Methode, URL, Rohbody). */
interface RecordedCall {
  method: string;
  url: string;
  body: BodyInit | null | undefined;
}

/** Minimaler, typisierter Response-Stub fuer die gemockte fetch-Funktion. */
function jsonResponse(
  payload: unknown,
  init?: { ok?: boolean; status?: number },
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => payload,
  } as unknown as Response;
}

/**
 * Liest den Storage-Body-Wert (body.storage.value) aus einem JSON-Request-Body.
 * Multipart-Bodies (FormData beim Bild-Upload) liefern den leeren String.
 */
function parseStorageValue(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") return "";
  const parsed = JSON.parse(body) as {
    body?: { storage?: { value?: string } };
  };
  return parsed.body?.storage?.value ?? "";
}

/** Setzt alle fuenf CONFLUENCE_*-Variablen via vi.stubEnv auf Sentinel-Werte. */
function stubConfluenceEnv(): void {
  vi.stubEnv("CONFLUENCE_USERNAME", SECRET_USER);
  vi.stubEnv("CONFLUENCE_PAT", SECRET_PAT);
  vi.stubEnv("CONFLUENCE_BASE_URL", SECRET_BASE_URL);
  vi.stubEnv("CONFLUENCE_SPACE_KEY", SECRET_SPACE);
  vi.stubEnv("CONFLUENCE_ROOT_PAGE_ID", ROOT_PAGE_ID);
}

/** Strukturierte Woche mit Bildern an mehreren Tagen (Mo, Di, Do) plus Link/Code. */
function buildUploadInput(): {
  journalText: string;
  kw: number;
  jahr: number;
  days: DayEntry[];
  reflexion: string;
} {
  const days: DayEntry[] = [
    {
      weekday: "montag",
      stichworte: "",
      text: "Montag-Text",
      attachments: [
        {
          type: "image",
          id: "m1",
          data: "aGVsbG8=",
          mimeType: "image/png",
          filename: "montag.png",
          caption: "Screenshot Montag",
        },
      ],
    },
    {
      weekday: "dienstag",
      stichworte: "",
      text: "Dienstag-Text",
      attachments: [
        {
          type: "link",
          id: "l1",
          url: "https://example.test/doku",
          displayText: "Doku",
        },
        {
          type: "image",
          id: "d1",
          data: "d29ybGQ=",
          mimeType: "image/jpeg",
          filename: "dienstag.jpg",
        },
      ],
    },
    {
      weekday: "mittwoch",
      stichworte: "",
      text: "Mittwoch-Text",
      attachments: [
        { type: "code", id: "c1", source: "const x = 1;\n", language: "ts" },
      ],
    },
    {
      weekday: "donnerstag",
      stichworte: "",
      text: "Donnerstag-Text",
      attachments: [
        {
          type: "image",
          id: "t1",
          data: "Zm9v",
          mimeType: "image/gif",
          filename: "donnerstag.gif",
        },
      ],
    },
    { weekday: "freitag", stichworte: "", text: "Freitag-Text", attachments: [] },
  ];
  return { journalText: "egal", kw: 24, jahr: 2025, days, reflexion: "" };
}

describe("confluence – uploadJournal Integration (Task 8.2 / 8.3)", () => {
  let calls: RecordedCall[];

  beforeEach(() => {
    calls = [];
    stubConfluenceEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Validates: Requirements 8.5
  it("Task 8.2: erfolgreicher Ablauf – Seite sicherstellen, alle Bilder hochladen, dann Body mit Bild-Makros in korrekter Tageszuordnung/Reihenfolge", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ method, url, body: init?.body });

        if (method === "GET" && url.includes("/child/page")) {
          // Keine bestehende KW-Seite gefunden → neue Seite wird erstellt.
          return jsonResponse({ results: [] });
        }
        if (method === "POST" && url.endsWith("/child/attachment")) {
          return jsonResponse({});
        }
        if (method === "POST" && url.endsWith("/rest/api/content")) {
          return jsonResponse({ id: PAGE_ID });
        }
        if (method === "PUT") {
          return jsonResponse({});
        }
        throw new Error(`unerwarteter fetch-Aufruf: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadJournal(buildUploadInput());
    expect(result).toEqual({ action: "created", pageId: PAGE_ID });

    // Reihenfolge: GET (Suche) → POST (erstellen, ohne Bild-Makros) → 3× POST
    // (Bild-Upload) → PUT (Body mit Bild-Makros).
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/child/page");

    const createIdx = calls.findIndex(
      (c) => c.method === "POST" && c.url.endsWith("/rest/api/content"),
    );
    const attachmentIdxs = calls
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.method === "POST" && x.c.url.endsWith("/child/attachment"))
      .map((x) => x.i);
    const putIdx = calls.findIndex((c) => c.method === "PUT");

    expect(createIdx).toBe(1);
    expect(attachmentIdxs).toHaveLength(3);
    expect(putIdx).toBeGreaterThanOrEqual(0);

    // Alle Bild-Uploads liegen NACH dem Erstellen und VOR dem Body-Update.
    attachmentIdxs.forEach((idx) => {
      expect(idx).toBeGreaterThan(createIdx);
      expect(idx).toBeLessThan(putIdx);
    });
    expect(putIdx).toBe(calls.length - 1);

    // Der bei der Erstellung geschriebene Body enthaelt KEINE Bild-Makros.
    expect(parseStorageValue(calls[createIdx].body)).not.toContain("<ac:image");

    // Der Bild-Makro-Body wird ausschliesslich im finalen PUT geschrieben.
    const bodiesWithImageMacros = calls.filter((c) =>
      parseStorageValue(c.body).includes("<ac:image"),
    );
    expect(bodiesWithImageMacros).toHaveLength(1);
    expect(bodiesWithImageMacros[0]).toBe(calls[putIdx]);

    // Bild-Makros referenzieren die je Anhang vergebenen Dateinamen
    // (`${id}-${filename}`) in globaler Reihenfolge (Tag fuer Tag).
    const value = parseStorageValue(calls[putIdx].body);
    const order = [...value.matchAll(/ri:filename="([^"]*)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      "m1-montag.png",
      "d1-dienstag.jpg",
      "t1-donnerstag.gif",
    ]);

    // Tageszuordnung: jedes Bild-Makro liegt im Abschnitt seines Tages.
    const idxMontag = value.indexOf("Montag:");
    const idxDienstag = value.indexOf("Dienstag:");
    const idxMittwoch = value.indexOf("Mittwoch:");
    const idxDonnerstag = value.indexOf("Donnerstag:");

    const idxM1 = value.indexOf('ri:filename="m1-montag.png"');
    expect(idxM1).toBeGreaterThan(idxMontag);
    expect(idxM1).toBeLessThan(idxDienstag);

    const idxD1 = value.indexOf('ri:filename="d1-dienstag.jpg"');
    expect(idxD1).toBeGreaterThan(idxDienstag);
    expect(idxD1).toBeLessThan(idxMittwoch);

    const idxT1 = value.indexOf('ri:filename="t1-donnerstag.gif"');
    expect(idxT1).toBeGreaterThan(idxDonnerstag);
  });

  // Validates: Requirements 8.6
  it("Task 8.3: Abbruch bei fehlgeschlagenem Bild-Upload – kein Body mit Bild-Makros, generische Fehlermeldung ohne Zugangsdaten", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ method, url, body: init?.body });

        if (method === "GET" && url.includes("/child/page")) {
          return jsonResponse({ results: [] });
        }
        if (method === "POST" && url.endsWith("/child/attachment")) {
          // Bild-Upload schlaegt fehl (Serverfehler).
          return jsonResponse({}, { ok: false, status: 500 });
        }
        if (method === "POST" && url.endsWith("/rest/api/content")) {
          return jsonResponse({ id: PAGE_ID });
        }
        if (method === "PUT") {
          return jsonResponse({});
        }
        throw new Error(`unerwarteter fetch-Aufruf: ${method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await uploadJournal(buildUploadInput());
    } catch (err) {
      caught = err;
    }

    // Der Upload bricht ab (wirft).
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;

    // Generische Meldung – nur der Status, keine Zugangsdaten/URL/Inhalte.
    expect(message).toBe("Confluence-Anfrage fehlgeschlagen (Status 500).");
    expect(message).not.toContain(SECRET_PAT);
    expect(message).not.toContain(SECRET_USER);
    expect(message).not.toContain(SECRET_SPACE);
    expect(message).not.toContain(SECRET_BASE_URL);

    // Es wird KEIN Body mit Bild-Makros geschrieben (weder PUT noch sonst ein
    // Aufruf traegt `<ac:image`).
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    const anyImageMacroBody = calls.some((c) =>
      parseStorageValue(c.body).includes("<ac:image"),
    );
    expect(anyImageMacroBody).toBe(false);
  });
});
