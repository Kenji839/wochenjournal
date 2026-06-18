/**
 * Fügt Commit-Titel an einen bestehenden Stichwort-Text an, ohne den
 * vorhandenen Inhalt zu verändern.
 *
 * Regeln:
 * - Ist `titles` leer, wird `existing` unverändert zurückgegeben.
 * - Andernfalls werden die Titel mit `\n` verbunden und – falls `existing`
 *   nicht leer ist – mit einem `\n` an `existing` angehängt.
 * - `existing` bleibt in jedem Fall als Präfix vollständig erhalten.
 */
export function appendKeywords(existing: string, titles: string[]): string {
  if (titles.length === 0) {
    return existing;
  }

  const angehaengt = titles.join("\n");

  return existing.length > 0 ? `${existing}\n${angehaengt}` : angehaengt;
}
