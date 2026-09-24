import type { Visit } from "./types";

export function parseVisits(raw: string | null): Record<string, Visit> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const entries: [string, Visit][] = [];
    for (const [id, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<Visit>;
      if (!Array.isArray(v.checked) || typeof v.notes !== "string") continue;
      const valid = new Set([
        "night",
        "windows",
        "heat",
        "air",
        "dpe",
        "risks",
        "building",
        "walk",
      ]);
      entries.push([
        id,
        {
          checked: [...new Set(v.checked.filter((k) => valid.has(k)))],
          notes: v.notes.slice(0, 10000),
          floor: typeof v.floor === "string" ? v.floor : "",
          orientation: typeof v.orientation === "string" ? v.orientation : "",
          courtyard: v.courtyard === true,
        },
      ]);
    }
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
