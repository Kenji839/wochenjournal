// Serverseitige Confluence-Logik: Konfiguration, Page_Title und der
// Storage_Converter (Journaltext -> Confluence-XHTML-Storage_Format).
// Die Zugangsdaten liegen ausschliesslich serverseitig in process.env und
// werden nie an den Client ausgeliefert oder geloggt.

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

// ---------------------------------------------------------------------------
// Confluence_Client: orchestriert Suchen / Erstellen / Aktualisieren der Seite.
// Spricht per eingebautem fetch direkt mit der Confluence-REST-API. Es werden
// keine Zugangsdaten geloggt oder in Fehlermeldungen aufgenommen.
// ---------------------------------------------------------------------------

/** Kennzeichnet, ob die Seite neu erstellt oder aktualisiert wurde. */
export type UploadAction = "created" | "updated";

/** Eingabe fuer uploadJournal (nur serverseitig genutzt). */
interface UploadInput {
  journalText: string;
  kw: number;
  jahr: number;
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

/**
 * Orchestriert den gesamten Upload eines Wochenjournals nach Confluence:
 * Konfiguration lesen, Titel bilden, Text ins Storage_Format wandeln, die
 * vorhandene Seite unter der Wurzelseite suchen und je nach Treffer
 * aktualisieren oder neu erstellen. Liest die Konfiguration aus process.env.
 */
export async function uploadJournal(input: UploadInput): Promise<UploadResult> {
  const config = loadConfig();
  const title = buildPageTitle(input.kw);
  const storage = convertToStorageFormat(input.journalText);

  const existing = await findExistingPage(config, title);

  if (existing) {
    const id = await updatePage(config, existing, storage);
    return { action: "updated", pageId: id };
  }

  const id = await createPage(config, title, storage);
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
  const url = `${config.baseUrl}/rest/api/content/${existing.id}`;
  const body = {
    id: existing.id,
    type: "page",
    title: existing.title, // bestehenden Titel beibehalten
    version: { number: existing.version.number + 1 },
    body: { storage: { value: storage, representation: "storage" } },
  };
  await confluenceFetch(config, url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return existing.id;
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
 * Fuehrt einen Confluence-REST-Aufruf mit den noetigen Headern (Bearer-PAT,
 * JSON) und einem einfachen Timeout aus. Wirft bei HTTP-Fehlerstatus oder
 * Netzwerkfehler einen generischen Error – bewusst ohne Zugangsdaten, URL oder
 * Antwortinhalt, damit der PAT niemals in eine Meldung oder ins Log gelangt.
 */
async function confluenceFetch(
  config: ConfluenceConfig,
  url: string,
  init: { method: string; body?: string },
): Promise<Response> {
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.pat}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
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
