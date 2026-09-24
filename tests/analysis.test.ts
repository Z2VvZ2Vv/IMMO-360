import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cleanSales,
  distanceMeters,
  isParisPostcode,
  median,
  normalizeAddress,
  type DvfRow,
} from "../src/lib/analysis";
import { parseVisits } from "../src/lib/storage";

const row: DvfRow = {
  id_mutation: "sale-1",
  date_mutation: "2025-04-01",
  nature_mutation: "Vente",
  type_local: "Appartement",
  valeur_fonciere: 500000,
  surface_reelle_bati: 50,
  nombre_pieces_principales: 2,
  adresse_numero: "10",
  adresse_nom_voie: "RUE DE BRETAGNE",
  longitude: 2.363588,
  latitude: 48.862475,
  id_parcelle: "75103000AJ0041",
  numero_disposition: 1,
};
test("DVF: never assign the whole mutation price to one of several apartments", () => {
  assert.equal(
    cleanSales(
      [row, { ...row, surface_reelle_bati: 30 }],
      row.latitude,
      row.longitude,
    ).length,
    0,
  );
});
test("DVF: one apartment with a dependency counts once, not once per row", () => {
  const sales = cleanSales(
    [row, { ...row, type_local: "Dépendance", surface_reelle_bati: 0 }],
    row.latitude,
    row.longitude,
  );
  assert.equal(sales.length, 1);
  assert.equal(sales[0].priceM2, 10000);
});
test("DVF: exclude mixed sales, multi-parcel sales and non-sales", () => {
  for (const change of [
    { type_local: "Local industriel. commercial ou assimilé" },
    { type_local: "Dépendance", id_parcelle: "other" },
    { type_local: "Dépendance", numero_disposition: 2 },
  ])
    assert.equal(
      cleanSales([row, { ...row, ...change }], row.latitude, row.longitude)
        .length,
      0,
    );
  assert.equal(
    cleanSales(
      [{ ...row, nature_mutation: "Echange" }],
      row.latitude,
      row.longitude,
    ).length,
    0,
  );
});
test("DVF: reject unusable surfaces and transactions outside 500 m", () => {
  for (const change of [
    { surface_reelle_bati: 0 },
    { valeur_fonciere: NaN },
    { latitude: 48.9 },
    { longitude: 0 },
  ])
    assert.equal(
      cleanSales([{ ...row, ...change }], row.latitude, row.longitude).length,
      0,
    );
});
test("Paris restriction excludes suburbs, invalid codes and other cities", () => {
  for (const code of ["75001", "75009", "75010", "75020", "75116"])
    assert.ok(isParisPostcode(code));
  for (const code of ["75000", "75021", "69001", "92100", ""])
    assert.equal(isParisPostcode(code), false);
});
test("Median and distance retain real zeros and handle missing values", () => {
  assert.equal(median([]), null);
  assert.equal(median([12000, 8000, 10000]), 10000);
  assert.equal(median([100, 200]), 150);
  assert.equal(median([NaN, 0]), 0);
  assert.equal(distanceMeters(48.86, 2.36, 48.86, 2.36), 0);
  assert.ok(distanceMeters(48.86, 2.36, 48.861, 2.36) > 100);
});
test("DPE matching ignores case, accents and spaces but preserves house numbers", () => {
  assert.equal(
    normalizeAddress("10 Rue de la Santé, 75013 Paris"),
    normalizeAddress("10 RUE DE LA SANTE 75013 PARIS"),
  );
  assert.notEqual(
    normalizeAddress("10 Rue de Bretagne"),
    normalizeAddress("12 Rue de Bretagne"),
  );
});
test("Malformed local notes cannot crash the workspace and checklist IDs are validated", () => {
  assert.deepEqual(parseVisits("bad json"), {});
  assert.deepEqual(parseVisits('{"a":{}}'), {});
  const data = parseVisits(
    '{"a":{"checked":["night","night","bad"],"notes":"hello"}}',
  );
  assert.deepEqual(data.a.checked, ["night"]);
  assert.equal(data.a.notes, "hello");
  assert.equal(data.a.courtyard, false);
});
