import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimale Test-Konfiguration für reine TS-Logik in `lib/`.
// Der `@/`-Alias spiegelt `tsconfig.json` (`"@/*": ["./*"]`) wider,
// damit Tests `@/lib/...` und `@/types/...` importieren können.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
