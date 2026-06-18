import {
  DEFAULT_REPO_PATH,
  parseRepoPaths,
  readGitSummaries,
} from "@/lib/git";

// node:child_process braucht die Node-Runtime (nicht Edge); nie cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validiert eine Query-Zahl als Ganzzahl im Bereich [min, max]. */
function parseIntInRange(
  wert: string | null,
  min: number,
  max: number,
): number | null {
  if (wert === null || !/^-?\d+$/.test(wert)) {
    return null;
  }
  const zahl = Number(wert);
  if (!Number.isInteger(zahl) || zahl < min || zahl > max) {
    return null;
  }
  return zahl;
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  // 1. week/year zuerst validieren – vor jedem Git-Aufruf (Requirement 2.2).
  const week = parseIntInRange(params.get("week"), 1, 53);
  if (week === null) {
    return new Response(
      "Parameter 'week' muss eine ganze Zahl zwischen 1 und 53 sein.",
      { status: 400 },
    );
  }

  const year = parseIntInRange(params.get("year"), 2000, 2100);
  if (year === null) {
    return new Response(
      "Parameter 'year' muss eine ganze Zahl zwischen 2000 und 2100 sein.",
      { status: 400 },
    );
  }

  // 2. Pfad-Fallback: repoPath-Query → GIT_REPO_PATH → Default. Jeder Wert darf
  //    eine kommagetrennte Liste mehrerer Repository_Pfade sein.
  const repoPathParam = params.get("repoPath");
  const repoPathValue =
    repoPathParam && repoPathParam.length > 0
      ? repoPathParam
      : process.env.GIT_REPO_PATH && process.env.GIT_REPO_PATH.length > 0
        ? process.env.GIT_REPO_PATH
        : DEFAULT_REPO_PATH;
  const repoPaths = parseRepoPaths(repoPathValue);

  // 3. Git_Reader kapselt alle Fehler und liefert im Zweifel eine Leere_Antwort
  //    mit unveränderten week/year (Requirement 6.3). Commit-Titel aus allen
  //    konfigurierten Repositories werden pro Wochentag zusammengeführt.
  const summary = readGitSummaries(repoPaths, week, year);

  // 4. week/year unverändert übernehmen, auch bei Leere_Antwort.
  return Response.json(summary);
}
