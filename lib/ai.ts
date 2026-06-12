import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Ruft die Google Gemini API im Streaming-Modus auf und gibt die reinen
 * Text-Chunks als ReadableStream zurück (kein SSE – der Client hängt die Chunks
 * einfach an).
 *
 * Der API-Key wird ausschliesslich serverseitig aus process.env gelesen.
 */
export async function streamCompletion(
  system: string,
  user: string,
  maxTokens: number,
): Promise<ReadableStream<Uint8Array>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const encoder = new TextEncoder();

  // Den Stream-Aufruf hier awaiten, damit Fehler wie ein erschöpftes Kontingent
  // (HTTP 429) bereits VOR dem Senden der Antwort auftreten. So kann der Route
  // Handler sie mit passendem Status/Meldung beantworten, statt dass der bereits
  // gestartete Stream mit "failed to pipe response" abbricht.
  const response = await ai.models.generateContentStream({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens,
      // Kein internes "Thinking" – wir wollen direkten Journaltext, und
      // Thinking würde sonst das Output-Budget aufbrauchen.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of response) {
          const text = chunk.text;
          if (text) {
            // Schweizer Hochdeutsch erzwingen: niemals "ß", immer "ss".
            // "ß" ist ein einzelnes Zeichen und wird nie über Chunks geteilt.
            controller.enqueue(encoder.encode(text.replace(/ß/g, "ss")));
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Erkennt einen Gemini-Kontingentfehler (HTTP 429 / RESOURCE_EXHAUSTED), damit
 * der Route Handler dem Client eine klare, generische Meldung zeigen kann.
 */
export function isQuotaError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { status?: unknown }).status;
  if (status === 429) return true;
  const message = (err as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)
  );
}
