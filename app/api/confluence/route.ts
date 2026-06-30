import { ConfigError, uploadJournal } from "@/lib/confluence";
import type { ConfluenceUploadRequest } from "@/types/journal";

// Spricht serverseitig per fetch mit Confluence (Node-Runtime); nie cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: ConfluenceUploadRequest;
  try {
    body = (await request.json()) as ConfluenceUploadRequest;
  } catch {
    return new Response("Ungültiger Request-Body.", { status: 400 });
  }

  // Pflichtangaben pruefen: journalText nichtleer, kw/jahr Zahlen sowie die
  // strukturierte Woche (days als Array, reflexion als String) fuer den
  // Link-/Code-/Bild-Upload (Req 8.5, 8.6).
  if (
    typeof body.journalText !== "string" ||
    body.journalText.trim() === "" ||
    typeof body.kw !== "number" ||
    typeof body.jahr !== "number" ||
    !Array.isArray(body.days) ||
    typeof body.reflexion !== "string"
  ) {
    return new Response("Pflichtangaben fehlen.", { status: 400 });
  }

  try {
    const result = await uploadJournal(body);
    return Response.json({ action: result.action }, { status: 200 });
  } catch (err) {
    // Keine Zugangsdaten/Details an den Client; kein Logging von Request-/
    // Konfigurationsinhalten. ConfigError -> 500, sonstige Fehler -> 502.
    const status = err instanceof ConfigError ? 500 : 502;
    return new Response("Upload nach Confluence fehlgeschlagen.", { status });
  }
}
