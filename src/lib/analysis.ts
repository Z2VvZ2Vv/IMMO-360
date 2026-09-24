import type { Sale } from "./types";

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return Math.round(
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
  );
}
export function normalizeAddress(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function isParisPostcode(value: string) {
  return /^750(0[1-9]|1\d|20)$/.test(value) || value === "75116";
}

export type DvfRow = {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  type_local: string;
  valeur_fonciere: number;
  surface_reelle_bati: number;
  nombre_pieces_principales: number;
  adresse_numero: string;
  adresse_nom_voie: string;
  longitude: number;
  latitude: number;
  id_parcelle: string;
  numero_disposition: number;
};
export function cleanSales(rows: DvfRow[], lat: number, lon: number): Sale[] {
  const groups = new Map<string, DvfRow[]>();
  for (const row of rows)
    groups.set(row.id_mutation, [...(groups.get(row.id_mutation) ?? []), row]);
  const sales: Sale[] = [];
  for (const [id, group] of groups) {
    // A mutation price covers the entire sale. Never divide it by one apartment
    // in a transaction containing several apartments, parcels or business premises.
    const homes = group.filter((r) => r.type_local === "Appartement");
    if (
      homes.length !== 1 ||
      new Set(group.map((r) => r.id_parcelle)).size !== 1 ||
      group.some((r) => !["Appartement", "Dépendance"].includes(r.type_local))
    )
      continue;
    if (new Set(group.map((r) => r.numero_disposition)).size !== 1) continue;
    const r = homes[0];
    const price = Number(r.valeur_fonciere),
      area = Number(r.surface_reelle_bati);
    if (
      r.nature_mutation !== "Vente" ||
      !Number.isFinite(price) ||
      !Number.isFinite(area) ||
      area <= 0 ||
      price <= 0 ||
      !r.latitude ||
      !r.longitude
    )
      continue;
    const distance = distanceMeters(
      lat,
      lon,
      Number(r.latitude),
      Number(r.longitude),
    );
    if (distance > 500) continue;
    sales.push({
      id,
      date: r.date_mutation,
      price,
      area,
      priceM2: Math.round(price / area),
      rooms: Number(r.nombre_pieces_principales),
      address: `${r.adresse_numero ?? ""} ${r.adresse_nom_voie}`,
      distance,
    });
  }
  return sales.sort((a, b) => b.date.localeCompare(a.date));
}
