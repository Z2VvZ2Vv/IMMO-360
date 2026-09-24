import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReport, searchAddresses } from "../src/lib/providers";
import type { Address } from "../src/lib/types";

const address: Address = {
  id: "paris",
  name: "10 Rue de Bretagne",
  label: "10 Rue de Bretagne 75003 Paris",
  postcode: "75003",
  district: "Paris 3e",
  lat: 48.862475,
  lon: 2.363588,
  precision: "housenumber",
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("Unexpected upstream schemas stay isolated as unavailable sources", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response({ unexpected: true });
  try {
    const report = await buildReport(address);
    assert.equal(
      report.sources.every((source) => source.status === "unavailable"),
      true,
    );
    assert.equal(report.terraceCount, null);
    assert.equal(report.places.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("Provider failure is isolated; missing data never becomes zero or fabricated", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("terrasses-autorisations"))
      return response({
        total_count: 2,
        results: [
          {
            nom_enseigne: "Example",
            typologie: "TERRASSE OUVERTE",
            geo_point_2d: { lat: address.lat, lon: address.lon },
          },
        ],
      });
    if (url.includes("espaces_verts"))
      return response({ total_count: 0, results: [] });
    return response({ error: "Unavailable" }, 503);
  };
  try {
    const report = await buildReport(address);
    assert.equal(report.terraceCount, 2);
    assert.equal(report.greenCount, 0);
    assert.equal(report.coolCount, null);
    assert.equal(report.medianPrice, null);
    assert.equal(report.sources.find((s) => s.id === "green")?.status, "empty");
    assert.equal(
      report.sources.find((s) => s.id === "cool")?.status,
      "unavailable",
    );
    assert.equal(report.places.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("Diagnostics at a neighbouring number are never attributed to the chosen address", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("ademe"))
      return response({
        results: [
          {
            numero_dpe: "correct",
            adresse_ban: address.label,
            etiquette_dpe: "D",
            etiquette_ges: "C",
            date_etablissement_dpe: "2025-01-01",
            surface_habitable_logement: 50,
          },
          {
            numero_dpe: "wrong",
            adresse_ban: "12 Rue de Bretagne 75003 Paris",
            etiquette_dpe: "A",
          },
        ],
      });
    return response({}, 503);
  };
  try {
    const report = await buildReport(address);
    assert.equal(report.diagnostics.length, 1);
    assert.equal(report.diagnostics[0].id, "correct");
  } finally {
    globalThis.fetch = original;
  }
});

test("Address search keeps only Paris even when the geocoder returns nearby towns", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    response({
      features: ["75003", "92100", "69001", "75116"].map((postcode) => ({
        geometry: { coordinates: [2.36, 48.86] },
        properties: {
          id: postcode,
          postcode,
          type: "housenumber",
          label: postcode,
          name: postcode,
          district: "Paris",
        },
      })),
    });
  try {
    assert.deepEqual(
      (await searchAddresses("rue de Paris")).map((a) => a.postcode),
      ["75003", "75116"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
