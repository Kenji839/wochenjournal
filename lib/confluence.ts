// Serverseitige Confluence-Logik: Konfiguration, Page_Title und der
// Storage_Converter (Journaltext -> Confluence-XHTML-Storage_Format).
// Die Zugangsdaten liegen ausschliesslich serverseitig in process.env und
// werden nie an den Client ausgeliefert oder geloggt.

import type {
  Attachment,
  CodeAttachment,
  DayEntry,
  ImageAttachment,
  LinkAttachment,
} from "@/types/journal";
import { WEEKDAYS } from "@/types/journal";

/** Interne Konfiguration des Confluence-Clients (nicht an den Client geteilt). */
interface ConfluenceConfig {
  username: string;
  pat: string;
  baseUrl: string; // ohne abschliessenden Slash normalisiert
  spaceKey: string;
  rootPageId: string;
}

/**
 * Fehlerklasse für fehlende oder leere Confluence-Konfiguration.
 * Die Meldung enthaelt hoechstens den Variablennamen, niemals den Wert.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Liest und validiert alle fuenf CONFLUENCE_*-Variablen aus process.env.
 * Normalisiert baseUrl (kein abschliessender Slash). Wirft einen ConfigError,
 * wenn eine Variable fehlt oder leer ist – ohne den Wert in die Meldung
 * aufzunehmen. Wird ausschliesslich serverseitig aufgerufen.
 */
export function loadConfig(): ConfluenceConfig {
  const username = requireEnv("CONFLUENCE_USERNAME");
  const pat = requireEnv("CONFLUENCE_PAT");
  const baseUrlRaw = requireEnv("CONFLUENCE_BASE_URL");
  const spaceKey = requireEnv("CONFLUENCE_SPACE_KEY");
  const rootPageId = requireEnv("CONFLUENCE_ROOT_PAGE_ID");

  return {
    username,
    pat,
    baseUrl: baseUrlRaw.replace(/\/+$/, ""),
    spaceKey,
    rootPageId,
  };
}

/**
 * Liest eine Pflicht-Variable aus process.env. Wirft einen ConfigError, wenn
 * sie fehlt oder (nach trim) leer ist. Der Wert wird nie geloggt oder in die
 * Fehlermeldung aufgenommen – nur der Variablenname.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(`Konfigurationsvariable ${name} fehlt oder ist leer.`);
  }
  return value;
}

/**
 * Bildet den Page_Title fuer eine Kalenderwoche, z. B. "KW 24".
 */
export function buildPageTitle(kw: number): string {
  return `KW ${kw}`;
}

/**
 * Wandelt den von composeJournal() erzeugten Journaltext in gueltiges
 * Confluence-Storage_Format (XHTML) um.
 *
 * Regeln:
 *  - Escaping zuerst (& vor < und >, damit Entities nicht doppelt maskiert
 *    werden), danach Fett-Konvertierung (**...** -> <strong>...</strong>).
 *  - Jede nichtleere Zeile wird ein Absatz <p>…</p>.
 *  - Jede leere Zeile wird als Absatztrenner <p /> ausgegeben.
 */
export function convertToStorageFormat(journalText: string): string {
  return journalText
    .split("\n")
    .map((line) => {
      const escaped = escapeXml(line); // & < >  (in dieser Reihenfolge)
      if (escaped.trim() === "") return "<p />"; // Leerzeile -> Absatztrenner
      const withBold = applyBold(escaped); // **x** -> <strong>x</strong>
      return `<p>${withBold}</p>`;
    })
    .join("");
}

/**
 * Maskiert XML-Sonderzeichen einer Zeile. "&" wird zwingend zuerst ersetzt,
 * damit bereits erzeugte Entities nicht doppelt maskiert werden.
 */
function escapeXml(line: string): string {
  return line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Wandelt paarweise mit **...** markierte Stellen einer Zeile in
 * <strong>...</strong> um. Wird nach dem Escaping angewendet.
 */
function applyBold(line: string): string {
  return line.replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Maskiert XML-Sonderzeichen eines Attributwerts. Zusaetzlich zu escapeXml wird
 * das doppelte Anfuehrungszeichen (") maskiert, damit der Wert in einem mit "
 * gequoteten Attribut (z. B. href) wohlgeformt bleibt. "&" wird zwingend zuerst
 * ersetzt, damit erzeugte Entities nicht doppelt maskiert werden.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rendert einen Link_Attachment als wohlgeformten Confluence-Anker
 * (`<a href="…">…</a>`). Der `href`-Wert uebernimmt die URL zeichengetreu (nur
 * maskiert via escapeAttr, nie gekuerzt/umgeschrieben). Der sichtbare Linktext
 * ist der Anzeigetext, oder – falls keiner vorhanden ist – die URL, jeweils mit
 * escapeXml (& < >) maskiert.
 */
export function renderLink(link: LinkAttachment): string {
  const text = link.displayText ?? link.url;
  return `<a href="${escapeAttr(link.url)}">${escapeXml(text)}</a>`;
}

/**
 * Rendert ein Code_Snippet als Confluence-`code`-Makro. Der Quelltext wird im
 * `ac:plain-text-body` mit escapeXml maskiert (garantiert wohlgeformt und ohne
 * Zeichenverlust). Eine Sprachangabe wird – sofern vorhanden – als
 * `language`-Parameter ausgegeben.
 */
export function renderCode(code: CodeAttachment): string {
  const language =
    code.language !== undefined
      ? `<ac:parameter ac:name="language">${escapeXml(code.language)}</ac:parameter>`
      : "";
  return (
    `<ac:structured-macro ac:name="code">` +
    language +
    `<ac:plain-text-body>${escapeXml(code.source)}</ac:plain-text-body>` +
    `</ac:structured-macro>`
  );
}

/**
 * Rendert ein Bild-Makro, das einen Seitenanhang ueber seinen Dateinamen
 * referenziert. Dateiname und (optionale) Bildunterschrift werden als
 * Attributwerte via escapeAttr maskiert.
 */
export function renderImageMacro(filename: string, caption?: string): string {
  return (
    `<ac:image ac:alt="${escapeAttr(caption ?? "")}">` +
    `<ri:attachment ri:filename="${escapeAttr(filename)}" />` +
    `</ac:image>`
  );
}

// ---------------------------------------------------------------------------
// Wochenkonverter: baut den vollstaendigen Storage_Body aus der strukturierten
// Woche (Tagestexte + Anhaenge je Tag + Reflexion). Header und Aufbau spiegeln
// composeJournal() (lib/journal.ts) wider; Textsegmente laufen durch die
// verhaltensgleiche Primitive convertToStorageFormat(text), Anhaenge werden je
// Tag direkt nach dem Tagesabsatz in gespeicherter Reihenfolge eingefuegt.
// ---------------------------------------------------------------------------

const HEADER_LERNENDER = "Lernender: Timo";
const HEADER_BETRIEB = "Betrieb: Appbakery / SBB, Bern";
const HEADER_AUSBILDUNG = "Ausbildungsjahr: 3. Lehrjahr";

/**
 * Strukturierte Eingabe fuer convertWeekToStorageFormat: die Woche so, wie sie
 * der Upload_Endpoint (und spaeter uploadJournal) durchreicht – Kalenderwoche,
 * Jahr, die Tage (Mo–Fr) mit Text und Anhaengen sowie der Reflexionsblock.
 * Bewusst eine Teilmenge von ConfluenceUploadRequest (ohne journalText), damit
 * Request und Konverter synchron bleiben.
 */
export interface StorageWeek {
  kw: number;
  jahr: number;
  /** Tage in der Reihenfolge von WEEKDAYS; je Tag Text und (optionale) Anhaenge. */
  days: DayEntry[];
  /** Reflexionsblock (Text). */
  reflexion: string;
}

/**
 * Wandelt die strukturierte Woche in den vollstaendigen Confluence-Storage_Body.
 *
 * Aufbau (analog composeJournal):
 *   Header → „Was habe ich…"-Ueberschrift → je Tag „Label: text" (Platzhalter
 *   „–" bei leerem Text) gefolgt von der Anhang-XHTML in gespeicherter
 *   Reihenfolge → Reflexion (nur falls nicht leer).
 *
 * Textsegmente laufen durch convertToStorageFormat (unveraendertes Verhalten:
 * Escaping, gepaarte Fett-Markierung, ein Absatz je Zeile). Anhaenge werden ueber
 * renderLink/renderCode/renderImageMacro gerendert; Bild-Makros referenzieren den
 * je Anhang vergebenen Dateinamen aus `imageFilenames` (Map: Anhang-id → Dateiname).
 */
export function convertWeekToStorageFormat(
  input: StorageWeek,
  imageFilenames: Map<string, string>,
): string {
  const parts: string[] = [];

  parts.push(
    convertToStorageFormat(
      `**Arbeitsjournal – KW ${input.kw} / ${input.jahr}**\n` +
        `${HEADER_LERNENDER}\n` +
        `${HEADER_BETRIEB}\n` +
        `${HEADER_AUSBILDUNG}`,
    ),
  );

  parts.push(convertToStorageFormat("**Was habe ich diese Woche gemacht?**"));

  for (const { key, label } of WEEKDAYS) {
    const eintrag = input.days.find((d) => d.weekday === key);
    const text = eintrag?.text.trim();
    parts.push(convertToStorageFormat(`${label}: ${text ? text : "–"}`));
    for (const attachment of eintrag?.attachments ?? []) {
      parts.push(renderAttachmentStorage(attachment, imageFilenames));
    }
  }

  const reflexion = input.reflexion.trim();
  if (reflexion) {
    parts.push(convertToStorageFormat(reflexion));
  }

  return parts.join("");
}

/**
 * Rendert einen einzelnen Tagesanhang als Storage_Format-XHTML. Bilder
 * referenzieren den fuer diesen Anhang vergebenen Dateinamen aus `imageFilenames`
 * (Fallback: der urspruengliche Dateiname), damit der Verweis wohlgeformt bleibt,
 * falls noch kein Upload-Name vergeben wurde.
 */
function renderAttachmentStorage(
  attachment: Attachment,
  imageFilenames: Map<string, string>,
): string {
  switch (attachment.type) {
    case "link":
      return renderLink(attachment);
    case "code":
      return renderCode(attachment);
    case "image": {
      const filename = imageFilenames.get(attachment.id) ?? attachment.filename;
      return renderImageMacro(filename, attachment.caption);
    }
  }
}

// ---------------------------------------------------------------------------
// Confluence_Client: orchestriert Suchen / Erstellen / Aktualisieren der Seite.
// Spricht per eingebautem fetch direkt mit der Confluence-REST-API. Es werden
// keine Zugangsdaten geloggt oder in Fehlermeldungen aufgenommen.
// ---------------------------------------------------------------------------

/** Kennzeichnet, ob die Seite neu erstellt oder aktualisiert wurde. */
export type UploadAction = "created" | "updated";

/**
 * Eingabe fuer uploadJournal (nur serverseitig genutzt). Traegt die
 * strukturierte Woche (Tage inkl. Anhaenge + Reflexion), damit Links, Code und
 * Bilder im Storage_Format aufgebaut werden koennen. `journalText` bleibt als
 * Fallback erhalten, falls keine strukturierten Tage vorliegen. Bewusst
 * deckungsgleich mit ConfluenceUploadRequest, damit Request und Client synchron
 * bleiben.
 */
interface UploadInput {
  journalText: string;
  kw: number;
  jahr: number;
  /** Strukturierte Tage (Mo–Fr) mit Text und Anhaengen. */
  days: DayEntry[];
  /** Reflexionsblock (Text). */
  reflexion: string;
}

/** Ergebnis eines Uploads (nur serverseitig genutzt). */
interface UploadResult {
  action: UploadAction;
  pageId: string;
}

/** Timeout je Confluence-Request in Millisekunden (einfach gehalten). */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Eine Unterseite, wie sie die Child-Page-Liste der REST-API liefert. Es werden
 * nur die hier benoetigten Felder typisiert (id, title, version.number).
 */
interface ChildPage {
  id: string;
  title: string;
  version: { number: number };
}

/** Antwortform der Child-Page-Liste (GET …/child/page). */
interface ChildPageList {
  results: ChildPage[];
}

/** Antwortform beim Erstellen einer Seite (POST …/content). */
interface CreatedPage {
  id: string;
}

/** Ein fuer den Multipart-Upload vorbereiteter Bildanhang (nur serverseitig). */
interface PendingImage {
  /** Eindeutiger, kollisionsfreier Dateiname auf der Seite. */
  filename: string;
  /** Dekodierte Rohbytes des Bildes. */
  bytes: Buffer;
  /** MIME-Typ fuer den Blob (PNG/JPEG/GIF/WEBP). */
  mimeType: string;
}

/**
 * Leitet aus einem Bildanhang einen eindeutigen Anhang-Dateinamen ab. Die
 * stabile `id` wird dem Originaldateinamen vorangestellt, damit gleichnamige
 * Bilder auf derselben Seite nicht kollidieren.
 */
function buildAttachmentFilename(image: ImageAttachment): string {
  return `${image.id}-${image.filename}`;
}

/**
 * Sammelt alle Bildanhaenge der Woche in gespeicherter Reihenfolge (Tag fuer
 * Tag) und baut parallel die Map Anhang-id → vergebener Dateiname, die der
 * Wochenkonverter fuer die Bild-Makros benoetigt. Die Bilddaten werden via
 * Buffer aus Base64 dekodiert.
 */
function collectImages(days: DayEntry[]): {
  images: PendingImage[];
  imageFilenames: Map<string, string>;
} {
  const images: PendingImage[] = [];
  const imageFilenames = new Map<string, string>();
  for (const day of days) {
    for (const attachment of day.attachments ?? []) {
      if (attachment.type !== "image") continue;
      const filename = buildAttachmentFilename(attachment);
      imageFilenames.set(attachment.id, filename);
      images.push({
        filename,
        bytes: Buffer.from(attachment.data, "base64"),
        mimeType: attachment.mimeType,
      });
    }
  }
  return { images, imageFilenames };
}

/**
 * Liefert eine Kopie der Tage ohne Bildanhaenge (Links/Code bleiben erhalten).
 * Dient dem Aufbau eines Storage_Body OHNE Bild-Makros, der vor dem
 * erfolgreichen Bild-Upload veroeffentlicht werden darf (Requirement 8.6).
 */
function stripImageAttachments(days: DayEntry[]): DayEntry[] {
  return days.map((day) => ({
    ...day,
    attachments: day.attachments?.filter((a) => a.type !== "image"),
  }));
}

/**
 * Baut den Storage_Body aus der strukturierten Woche. Sind keine Tage vorhanden,
 * wird der flache journalText als Fallback ins Storage_Format gewandelt. Die
 * Bild-Makros referenzieren die je Anhang vergebenen Dateinamen aus
 * `imageFilenames`.
 */
function buildStorageBody(
  input: UploadInput,
  days: DayEntry[],
  imageFilenames: Map<string, string>,
): string {
  if (days.length === 0) {
    return convertToStorageFormat(input.journalText);
  }
  return convertWeekToStorageFormat(
    { kw: input.kw, jahr: input.jahr, days, reflexion: input.reflexion },
    imageFilenames,
  );
}

/**
 * Laedt alle Bildanhaenge nacheinander als Seitenanhaenge hoch. Sequentiell
 * (await je Bild), damit ein Fehler den Vorgang sofort abbricht, bevor ein Body
 * mit Bild-Makros geschrieben wird.
 */
async function uploadAllImages(
  config: ConfluenceConfig,
  pageId: string,
  images: PendingImage[],
): Promise<void> {
  for (const image of images) {
    await uploadAttachment(
      config,
      pageId,
      image.filename,
      image.bytes,
      image.mimeType,
    );
  }
}

/**
 * Orchestriert den gesamten Upload eines Wochenjournals nach Confluence gemaess
 * Sequenzdiagramm: Konfiguration lesen, Titel bilden, vorhandene Seite suchen
 * oder – ohne Bild-Makros – neu erstellen, anschliessend alle Bilder als Anhang
 * hochladen und erst bei vollstaendigem Erfolg den Body inkl. Bild-Makros mit
 * version+1 schreiben. Schlaegt ein Bild-Upload fehl, bricht der Vorgang ab,
 * bevor ein Body mit Bild-Makros veroeffentlicht wird (Requirement 8.5, 8.6).
 * Liest die Konfiguration aus process.env.
 */
export async function uploadJournal(input: UploadInput): Promise<UploadResult> {
  const config = loadConfig();
  const title = buildPageTitle(input.kw);
  const days = input.days ?? [];

  const { images, imageFilenames } = collectImages(days);
  const bodyWithImages = buildStorageBody(input, days, imageFilenames);

  const existing = await findExistingPage(config, title);

  if (existing) {
    // Bestehende Seite: zuerst Bilder hochladen, dann Body mit Makros (version+1).
    await uploadAllImages(config, existing.id, images);
    const id = await updatePage(config, existing, bodyWithImages);
    return { action: "updated", pageId: id };
  }

  // Neue Seite ohne Bilder: direkt mit vollstaendigem Body anlegen.
  if (images.length === 0) {
    const id = await createPage(config, title, bodyWithImages);
    return { action: "created", pageId: id };
  }

  // Neue Seite mit Bildern: erst bild-makrofreien Body anlegen, dann Bilder
  // hochladen, erst danach den Body mit Bild-Makros schreiben (version 2).
  const bodyWithoutImages = buildStorageBody(
    input,
    stripImageAttachments(days),
    new Map<string, string>(),
  );
  const id = await createPage(config, title, bodyWithoutImages);
  await uploadAllImages(config, id, images);
  await writePageBody(config, id, title, 2, bodyWithImages);
  return { action: "created", pageId: id };
}

/**
 * Sucht unter den direkten Unterseiten der Wurzelseite nach einer Seite mit
 * exakt dem gewuenschten Titel. Listet die Kinder inkl. Versionsinfo und gibt
 * bei einem Treffer die bestehende Seite zurueck, sonst null.
 */
async function findExistingPage(
  config: ConfluenceConfig,
  title: string,
): Promise<ChildPage | null> {
  const url = `${config.baseUrl}/rest/api/content/${config.rootPageId}/child/page?limit=250&expand=version`;
  const response = await confluenceFetch(config, url, { method: "GET" });
  const data = (await response.json()) as ChildPageList;
  const hit = data.results.find((page) => page.title === title);
  return hit ?? null;
}

/**
 * Aktualisiert eine bestehende Seite: behaelt Titel und Elternseite bei (kein
 * ancestors-Feld) und erhoeht die Versionsnummer um genau eins. Gibt die
 * Seiten-Id zurueck.
 */
async function updatePage(
  config: ConfluenceConfig,
  existing: ChildPage,
  storage: string,
): Promise<string> {
  await writePageBody(
    config,
    existing.id,
    existing.title,
    existing.version.number + 1,
    storage,
  );
  return existing.id;
}

/**
 * Schreibt den Storage_Body einer bestehenden Seite per PUT mit der exakt
 * angegebenen Versionsnummer und behaelt den Titel bei (kein ancestors-Feld).
 * Gemeinsame Primitive fuer updatePage (version+1) und den Nachtrag der
 * Bild-Makros bei einer frisch erstellten Seite (version 2).
 */
async function writePageBody(
  config: ConfluenceConfig,
  pageId: string,
  title: string,
  versionNumber: number,
  storage: string,
): Promise<void> {
  const url = `${config.baseUrl}/rest/api/content/${pageId}`;
  const body = {
    id: pageId,
    type: "page",
    title, // bestehenden Titel beibehalten
    version: { number: versionNumber },
    body: { storage: { value: storage, representation: "storage" } },
  };
  await confluenceFetch(config, url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Erstellt eine neue Seite als Kind der Wurzelseite im konfigurierten Space.
 * Gibt die Id der neu erstellten Seite zurueck.
 */
async function createPage(
  config: ConfluenceConfig,
  title: string,
  storage: string,
): Promise<string> {
  const url = `${config.baseUrl}/rest/api/content`;
  const body = {
    type: "page",
    title,
    space: { key: config.spaceKey },
    ancestors: [{ id: config.rootPageId }],
    body: { storage: { value: storage, representation: "storage" } },
  };
  const response = await confluenceFetch(config, url, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as CreatedPage;
  return data.id;
}

/**
 * Laedt ein einzelnes Bild als Seitenanhang per Multipart hoch. Der Anhang
 * reist im `file`-Feld, der Header `X-Atlassian-Token: no-check` umgeht den
 * XSRF-Schutz von Confluence. Der Content-Type (inkl. Multipart-Boundary) wird
 * bewusst NICHT manuell gesetzt, sondern von fetch/FormData bestimmt. Fehler
 * laufen ueber die generische confluenceFetch-Strategie (nur Status, keine
 * Zugangsdaten/URLs/Inhalte).
 */
async function uploadAttachment(
  config: ConfluenceConfig,
  pageId: string,
  filename: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const url = `${config.baseUrl}/rest/api/content/${pageId}/child/attachment`;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  await confluenceFetch(config, url, {
    method: "POST",
    body: form,
    json: false,
    extraHeaders: { "X-Atlassian-Token": "no-check" },
  });
}

/**
 * Fuehrt einen Confluence-REST-Aufruf mit den noetigen Headern (Bearer-PAT,
 * JSON) und einem einfachen Timeout aus. Wirft bei HTTP-Fehlerstatus oder
 * Netzwerkfehler einen generischen Error – bewusst ohne Zugangsdaten, URL oder
 * Antwortinhalt, damit der PAT niemals in eine Meldung oder ins Log gelangt.
 *
 * Fuer JSON-Aufrufe (Default) wird `Content-Type: application/json` gesetzt. Bei
 * Multipart-Uploads (`json: false`) wird der Content-Type bewusst weggelassen,
 * damit fetch/FormData die Boundary selbst bestimmen; zusaetzliche Header
 * (z. B. `X-Atlassian-Token`) kommen ueber `extraHeaders`.
 */
async function confluenceFetch(
  config: ConfluenceConfig,
  url: string,
  init: {
    method: string;
    body?: BodyInit;
    json?: boolean;
    extraHeaders?: Record<string, string>;
  },
): Promise<Response> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.pat}`,
      Accept: "application/json",
      ...(init.json === false ? {} : { "Content-Type": "application/json" }),
      ...init.extraHeaders,
    };
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Nur der Status, niemals Header (PAT) oder Body in die Meldung.
      throw new Error(`Confluence-Anfrage fehlgeschlagen (Status ${response.status}).`);
    }
    return response;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Confluence-Anfrage")) {
      throw err; // bereits generische HTTP-Fehlermeldung
    }
    // Netzwerk-/Timeout-Fehler ebenfalls generisch und ohne Zugangsdaten melden.
    throw new Error("Confluence ist nicht erreichbar.");
  }
}
