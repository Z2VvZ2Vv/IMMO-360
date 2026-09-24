export type Address = {
  id: string;
  label: string;
  name: string;
  postcode: string;
  district: string;
  lat: number;
  lon: number;
  precision: string;
};
export type SourceId = "terraces" | "green" | "cool" | "dpe" | "dvf" | "risks";
export type Source = {
  id: SourceId;
  name: string;
  url: string;
  status: "ok" | "empty" | "unavailable";
  count: number;
  scope: string;
  note: string;
  fetchedAt: string;
};
export type Place = {
  id: string;
  name: string;
  category: "terrace" | "green" | "cool";
  lat: number;
  lon: number;
  distance: number;
  description: string;
};
export type Diagnostic = {
  id: string;
  label: string;
  ges: string;
  date: string;
  area: number;
  address: string;
};
export type Sale = {
  id: string;
  date: string;
  price: number;
  area: number;
  priceM2: number;
  rooms: number;
  address: string;
  distance: number;
};
export type Report = {
  address: Address;
  generatedAt: string;
  sources: Source[];
  places: Place[];
  diagnostics: Diagnostic[];
  sales: Sale[];
  risks: string[];
  terraceCount: number | null;
  greenCount: number | null;
  coolCount: number | null;
  medianPrice: number | null;
};
export type Visit = {
  checked: string[];
  notes: string;
  floor: string;
  orientation: string;
  courtyard: boolean;
};
