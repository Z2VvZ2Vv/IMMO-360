"use client";
import { useEffect, useRef } from "react";
import type { Report } from "@/lib/types";

type Registry = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
};

/** Optional browser support. No notes or other local user data are exposed. */
export function useReportTool(report: Report | null) {
  const current = useRef(report);
  useEffect(() => {
    current.current = report;
  }, [report]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "read_current_address_report",
            title: "Lire la fiche publique de l’adresse",
            description:
              "Lire les indicateurs et sources publiques de la fiche actuellement affichée. Ne modifie rien et ne donne pas accès aux notes, favoris ou observations personnelles.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error("Un objet vide est attendu.");
              const r = current.current;
              if (!r)
                throw new Error(
                  "Aucune fiche n’est encore disponible. Analysez une adresse dans l’interface.",
                );
              return {
                address: r.address.label,
                generatedAt: r.generatedAt,
                terraceAuthorizations200m: r.terraceCount,
                greenPlaces500m: r.greenCount,
                coolPlaces500m: r.coolCount,
                diagnosticsAtAddress: r.diagnostics.length,
                medianSalePriceM2: r.medianPrice,
                saleSampleSize: r.sales.length,
                sources: r.sources,
                limitations:
                  "Pas de mesure du bruit ou de la température intérieure. DPE non attribués au logement. Ventes issues d’un échantillon de la section cadastrale.",
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional API: unsupported or denied registration is non-blocking. */
    }
    return () => lifecycle.abort();
  }, []);
}
