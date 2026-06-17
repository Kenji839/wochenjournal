import { isQuotaError, streamCompletion } from "@/lib/ai";
import {
  buildDayPrompt,
  buildReflectionPrompt,
  buildRevisePrompt,
} from "@/lib/prompt";
import type { GenerateRequest } from "@/types/journal";

// Das Gemini-SDK läuft serverseitig (Node-Runtime); nie cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKENS_DAY = 1024;
const MAX_TOKENS_REFLECTION = 1500;
const MAX_TOKENS_REVISE = 4096; // ganzes Journal kann länger sein

export async function POST(request: Request): Promise<Response> {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return new Response("Ungültiger Request-Body.", { status: 400 });
  }

  let system: string;
  let user: string;
  let maxTokens: number;

  if (body.mode === "day") {
    if (!body.stichworte?.trim()) {
      return new Response("Stichworte fehlen.", { status: 400 });
    }
    ({ system, user } = buildDayPrompt(body));
    maxTokens = MAX_TOKENS_DAY;
  } else if (body.mode === "reflection") {
    const hatAbsatz = body.days?.some((d) => d.text?.trim() !== "");
    if (!hatAbsatz) {
      return new Response("Keine Tagesabsätze vorhanden.", { status: 400 });
    }
    ({ system, user } = buildReflectionPrompt(body));
    maxTokens = MAX_TOKENS_REFLECTION;
  } else if (body.mode === "revise") {
    if (!body.journalText?.trim()) {
      return new Response("Gesamtjournal fehlt.", { status: 400 });
    }
    if (!body.anweisung?.trim()) {
      return new Response("Anweisung fehlt.", { status: 400 });
    }
    ({ system, user } = buildRevisePrompt(body));
    maxTokens = MAX_TOKENS_REVISE;
  } else {
    return new Response("Unbekannter Modus.", { status: 400 });
  }

  try {
    const stream = await streamCompletion(system, user, maxTokens);
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    // Erschöpftes Gemini-Kontingent klar kennzeichnen (HTTP 429), sonst
    // generischer 500. Keine Fehlerdetails an den Client (könnten Request-Infos
    // enthalten); der API-Key wird nie geloggt.
    if (isQuotaError(err)) {
      return new Response(
        "Gemini-Kontingent erschöpft. Bitte versuche es später erneut.",
        { status: 429 },
      );
    }
    return new Response("Generierung fehlgeschlagen.", { status: 500 });
  }
}
