import {
  cleanSales,
  distanceMeters,
  isParisPostcode,
  median,
  normalizeAddress,
  type DvfRow,
} from "./analysis";
import type {
  Address,
  Diagnostic,
  Place,
  Report,
  Source,
  SourceId,
} from "./types";

type RecordData = Record<string, unknown>;
const PARIS =
  "https://parisdata.opendatasoft.com/api/explore/v2.1/catalog/datasets";
export async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
export async function searchAddresses(query: string): Promise<Address[]> {
  const params = new URLSearchParams({
    q: query,
    index: "address",
    limit: "12",
    lat: "48.8566",
    lon: "2.3522",
  });
  const result = await fetchJSON<{
    features: {
      geometry: { coordinates: number[] };
      properties: Record<string, string>;
    }[];
  }>(`https://data.geopf.fr/geocodage/search?${params}`);
  return (result.features ?? [])
    .filter(
      (f) =>
        isParisPostcode(f.properties.postcode ?? "") &&
        ["housenumber", "street"].includes(f.properties.type),
    )
    .slice(0, 6)
    .map((f) => ({
      id: f.properties.id,
      label: f.properties.label,
      name: f.properties.name,
      postcode: f.properties.postcode,
      district: f.properties.district,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      precision: f.properties.type,
    }));
}
function parisURL(
  dataset: string,
  field: string,
  address: Address,
  radius: number,
  select: string,
  extra = "",
) {
  const where = `within_distance(${field}, geom'POINT(${address.lon} ${address.lat})', ${radius}m)${extra}`;
  return `${PARIS}/${dataset}/records?${new URLSearchParams({ where, limit: "100", select, order_by: `distance(${field}, geom'POINT(${address.lon} ${address.lat})')` })}`;
}
const SOURCES: Record<
  SourceId,
  { name: string; url: string; scope: string; note: string }
> = {
  terraces: {
    name: "Ville de Paris · Terrasses",
    url: "https://parisdata.opendatasoft.com/explore/dataset/terrasses-autorisations/",
    scope: "Rayon de 200 m",
    note: "Autorisations de terrasses, pas une mesure de bruit. Plusieurs autorisations peuvent concerner un établissement.",
  },
  green: {
    name: "Ville de Paris · Espaces verts",
    url: "https://parisdata.opendatasoft.com/explore/dataset/espaces_verts/",
    scope: "Rayon de 500 m",
    note: "Espaces recensés, y compris végétalisation de voirie. La distance est à vol d’oiseau jusqu’au point du jeu de données.",
  },
  cool: {
    name: "Ville de Paris · Îlots de fraîcheur",
    url: "https://parisdata.opendatasoft.com/explore/dataset/ilots-de-fraicheur-espaces-verts-frais/",
    scope: "Rayon de 500 m",
    note: "Lieux de fraîcheur recensés. Leur présence ne mesure ni la température ni le confort d’été du logement.",
  },
  dpe: {
    name: "ADEME · Diagnostics énergétiques",
    url: "https://data.ademe.fr/datasets/dpe03existant",
    scope: "Adresse exacte",
    note: "DPE déclarés à la même adresse. L’appartement doit être identifié par son numéro de DPE : aucun diagnostic n’est automatiquement attribué au logement visité.",
  },
  dvf: {
    name: "DGFiP / Etalab · Transactions DVF",
    url: "https://explore.data.gouv.fr/immobilier",
    scope: "Section cadastrale, à moins de 500 m",
    note: "Les 100 ventes les plus récentes d’un seul appartement, hors mutations complexes ; dépendances éventuelles incluses dans le prix. Échantillon de la section cadastrale, pas l’ensemble du quartier. Les prix historiques ne constituent pas une estimation du bien.",
  },
  risks: {
    name: "Géorisques · Risques communaux",
    url: "https://www.georisques.gouv.fr/",
    scope: "Commune de Paris",
    note: "Risques recensés à l’échelle communale. Ne détermine pas l’exposition de l’adresse et ne remplace pas un état des risques ou ERRIAL.",
  },
};
async function readDpe(address: Address): Promise<Diagnostic[]> {
  if (address.precision !== "housenumber") return [];
  const params = new URLSearchParams({
    size: "100",
    geo_distance: `${address.lon},${address.lat},20`,
    sort: "-date_etablissement_dpe",
    select:
      "numero_dpe,etiquette_dpe,etiquette_ges,adresse_ban,date_etablissement_dpe,surface_habitable_logement",
  });
  const data = await fetchJSON<{ results: RecordData[] }>(
    `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?${params}`,
  );
  return data.results
    .filter(
      (r) =>
        normalizeAddress(String(r.adresse_ban)) ===
        normalizeAddress(address.label),
    )
    .map((r) => ({
      id: String(r.numero_dpe),
      label: String(r.etiquette_dpe),
      ges: String(r.etiquette_ges),
      date: String(r.date_etablissement_dpe),
      area: Number(r.surface_habitable_logement),
      address: String(r.adresse_ban),
    }));
}
async function readSales(address: Address) {
  const geom = JSON.stringify({
    type: "Point",
    coordinates: [address.lon, address.lat],
  });
  const parcel = await fetchJSON<{
    features: { properties: { idu: string } }[];
  }>(
    `https://apicarto.ign.fr/api/cadastre/parcelle?${new URLSearchParams({ geom })}`,
  );
  const id = parcel.features[0]?.properties.idu;
  if (!id || !/^75\d{6}[A-Z0-9]{2}\d{4}$/.test(id)) return [];
  const data = await fetchJSON<{ data: DvfRow[] }>(
    `https://dvf-api.data.gouv.fr/mutations/${id.slice(0, 5)}/${id.slice(5, 10)}`,
  );
  return cleanSales(data.data ?? [], address.lat, address.lon).slice(0, 100);
}
function places(
  rows: RecordData[],
  category: Place["category"],
  address: Address,
): Place[] {
  return rows.flatMap((r, i) => {
    const point = (r.geo_point_2d ?? r.geom_x_y) as
      { lat: number; lon: number } | undefined;
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon))
      return [];
    return [
      {
        id: `${category}-${i}`,
        category,
        name: String(r.nom_enseigne ?? r.nom_ev ?? r.nom ?? "Lieu recensé"),
        lat: point.lat,
        lon: point.lon,
        distance: distanceMeters(
          address.lat,
          address.lon,
          point.lat,
          point.lon,
        ),
        description: String(r.typologie ?? r.categorie ?? r.type ?? ""),
      },
    ];
  });
}
type ParisResult = { total_count: number; results: RecordData[] };
async function readParis(url: string): Promise<ParisResult> {
  const result = await fetchJSON<ParisResult>(url);
  if (
    !result ||
    !Number.isFinite(result.total_count) ||
    !Array.isArray(result.results)
  ) {
    throw new Error("Format Paris Data inattendu");
  }
  return result;
}
async function readRisks(): Promise<string[]> {
  const result = await fetchJSON<{
    data: {
      risques_detail?: { libelle_risque_long?: string }[];
      libelle_risque_long?: string;
    }[];
  }>(
    "https://www.georisques.gouv.fr/api/v1/gaspar/risques?code_insee=75056&page_size=100",
  );
  if (!result || !Array.isArray(result.data))
    throw new Error("Format Géorisques inattendu");
  return [
    ...new Set(
      result.data.flatMap(
        (x) =>
          x.risques_detail
            ?.map((y) => y.libelle_risque_long ?? "")
            .filter(Boolean) ??
          (x.libelle_risque_long ? [x.libelle_risque_long] : []),
      ),
    ),
  ];
}
export async function buildReport(address: Address): Promise<Report> {
  const result = await Promise.allSettled([
    readParis(
      parisURL(
        "terrasses-autorisations",
        "geo_point_2d",
        address,
        200,
        "nom_enseigne,typologie,geo_point_2d",
        " AND typologie like '%TERRASSE%'",
      ),
    ),
    readParis(
      parisURL(
        "espaces_verts",
        "geom_x_y",
        address,
        500,
        "nom_ev,categorie,geom_x_y",
      ),
    ),
    readParis(
      parisURL(
        "ilots-de-fraicheur-espaces-verts-frais",
        "geo_point_2d",
        address,
        500,
        "nom,type,categorie,geo_point_2d",
      ),
    ),
    readDpe(address),
    readSales(address),
    readRisks(),
  ]);
  const [t, g, c, d, v, r] = result;
  const retrievedAt = new Date().toISOString();
  const diagnostics = d.status === "fulfilled" ? d.value : [];
  const sales = v.status === "fulfilled" ? v.value : [];
  const risks = r.status === "fulfilled" ? r.value : [];
  const counts = [
    t.status === "fulfilled" ? t.value.total_count : 0,
    g.status === "fulfilled" ? g.value.total_count : 0,
    c.status === "fulfilled" ? c.value.total_count : 0,
    diagnostics.length,
    sales.length,
    risks.length,
  ];
  const ids: SourceId[] = ["terraces", "green", "cool", "dpe", "dvf", "risks"];
  const sources: Source[] = ids.map((id, i) => ({
    id,
    ...SOURCES[id],
    status:
      result[i].status === "rejected"
        ? "unavailable"
        : counts[i] > 0
          ? "ok"
          : "empty",
    count: counts[i],
    fetchedAt: retrievedAt,
  }));
  return {
    address,
    generatedAt: retrievedAt,
    sources,
    diagnostics,
    sales,
    risks,
    places: [
      ...(t.status === "fulfilled"
        ? places(t.value.results, "terrace", address)
        : []),
      ...(g.status === "fulfilled"
        ? places(g.value.results, "green", address)
        : []),
      ...(c.status === "fulfilled"
        ? places(c.value.results, "cool", address)
        : []),
    ],
    terraceCount: t.status === "fulfilled" ? t.value.total_count : null,
    greenCount: g.status === "fulfilled" ? g.value.total_count : null,
    coolCount: c.status === "fulfilled" ? c.value.total_count : null,
    medianPrice: sales.length >= 3 ? median(sales.map((s) => s.priceM2)) : null,
  };
}
