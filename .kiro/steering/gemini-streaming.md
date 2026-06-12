---
inclusion: fileMatch
fileMatchPattern: 'lib/ai.ts'
---

# Google Gemini SDK – Streaming (Server)

Gilt für `lib/ai.ts` und den Route Handler `app/api/generate/route.ts`.
SDK: `@google/genai` (v2.x), Server-seitig.

## Client

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

- API-Key aus `process.env.GEMINI_API_KEY`. Nicht hardcoden, nicht loggen.
- Modell aus `process.env.GEMINI_MODEL ?? "gemini-2.5-flash"`.

## Streaming-Aufruf

`ai.models.generateContentStream(...)` gibt ein **Promise** auf einen
async-iterierbaren Stream zurück (also `await` nötig). Der System-Prompt geht in
`config.systemInstruction`, das Token-Limit in `config.maxOutputTokens`.

```ts
const response = await ai.models.generateContentStream({
  model,
  contents: user,                       // User-Prompt als String
  config: {
    systemInstruction: system,          // System-Prompt hier
    maxOutputTokens: maxTokens,
  },
});

for await (const chunk of response) {
  const text = chunk.text;              // string | undefined
  if (text) {
    // ... enqueue
  }
}
```

## In einen ReadableStream verpacken

Ziel: reiner Text-Stream (`text/plain`) an den Client, kein SSE.

```ts
export function streamCompletion(
  system: string,
  user: string,
  maxTokens: number,
): ReadableStream<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await ai.models.generateContentStream({
          model,
          contents: user,
          config: { systemInstruction: system, maxOutputTokens: maxTokens },
        });
        for await (const chunk of response) {
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
```

## Stolperfallen

- **Node-Runtime nötig**: Route Handler braucht `export const runtime = "nodejs"`.
- `generateContentStream` ist ein **Promise** → `await` nicht vergessen, sonst
  schlägt `for await` fehl.
- `chunk.text` kann `undefined` sein (z. B. reine Metadaten-Chunks) → vor dem
  Enqueue prüfen.
- API-Key niemals an den Client geben; dem Client nur eine generische
  Fehlermeldung zeigen.
- Fehler wie zu wenig Kontingent treten ggf. erst während des Streams auf
  (`controller.error`); der Client zeigt dann das Fehler-Banner.
