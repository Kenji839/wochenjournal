import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Ruft die Google Gemini API im Streaming-Modus auf und gibt die reinen
 * Text-Chunks als ReadableStream zurück (kein SSE – der Client hängt die Chunks
 * einfach an).
 *
 * Der API-Key wird ausschliesslich serverseitig aus process.env gelesen.
 */
export function streamCompletion(
  system: string,
  user: string,
  maxTokens: number,
): ReadableStream<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
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
