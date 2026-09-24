import type { Source } from "./types";

/** Qualitative, transparent applicability judgement, not a statistical probability. */
export function sourceConfidence(source: Source): string {
  if (source.status !== "ok") return "Non évaluée";
  if (["terraces", "green", "cool"].includes(source.id))
    return "Élevée pour le recensement";
  if (source.id === "dpe") return "Modérée · logement à identifier";
  if (source.id === "dvf")
    return source.count >= 3
      ? "Modérée · échantillon local"
      : "Limitée · échantillon insuffisant";
  return "Limitée · échelle communale";
}
