"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { Address, Place } from "@/lib/types";
import "leaflet/dist/leaflet.css";

export default function NeighborhoodMap({
  address,
  places,
  large = false,
}: {
  address: Address;
  places: Place[];
  large?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState("all");
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;
      const instance = L.map(container.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([address.lat, address.lon], 16);
      const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();
      if (cartoKey) {
        L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
          {
            subdomains: "abcd",
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        )
          .on("tileerror", () => setTileError(true))
          .on("tileload", () => setTileError(false))
          .addTo(instance);
      } else {
        // Never request unauthenticated tiles: CARTO adds a watermark to them.
        setTileError(true);
      }
      markers.current = L.layerGroup().addTo(instance);
      map.current = instance;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current = null;
    };
    // The instance lives for the component lifetime; the next effect recenters it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    import("leaflet").then((L) => {
      if (!map.current || !markers.current) return;
      markers.current.clearLayers();
      map.current.setView([address.lat, address.lon], 16);
      const point = L.divIcon({
        className: "address-marker",
        html: '<span><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 10 9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8"/></svg></span>',
        iconSize: [44, 44],
        iconAnchor: [22, 44],
      });
      const label = document.createElement("span");
      label.textContent = address.label;
      L.marker([address.lat, address.lon], {
        icon: point,
        zIndexOffset: 1000,
        title: address.label,
        alt: address.label,
      })
        .bindTooltip(label)
        .addTo(markers.current);
      L.circle([address.lat, address.lon], {
        radius: 200,
        color: "#338368",
        weight: 1,
        dashArray: "5 7",
        fillColor: "#5b9d7d",
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(markers.current);
      for (const place of places.filter(
        (p) => layer === "all" || p.category === layer,
      )) {
        const icon = L.divIcon({
          className: `place-marker ${place.category}`,
          html:
            place.category === "terrace"
              ? "<span>☕</span>"
              : place.category === "green"
                ? "<span>♧</span>"
                : "<span>❋</span>",
          iconSize: [27, 27],
        });
        const tooltip = document.createElement("span");
        tooltip.textContent = `${place.name} · ${place.distance} m`;
        L.marker([place.lat, place.lon], {
          icon,
          title: place.name,
          alt: place.name,
        })
          .bindTooltip(tooltip)
          .addTo(markers.current);
      }
      map.current.invalidateSize();
    });
  }, [address, places, layer, ready]);
  return (
    <div className={`map-shell ${large ? "large" : ""}`}>
      <div
        ref={container}
        className="map-canvas"
        role="img"
        aria-label={`Carte des lieux à proximité de ${address.label}`}
      />
      <div className="map-layers" aria-label="Calques de la carte">
        {[
          ["all", "Tout"],
          ["terrace", "Terrasses"],
          ["green", "Nature"],
          ["cool", "Fraîcheur"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={layer === key ? "selected" : ""}
            onClick={() => setLayer(key)}
            aria-pressed={layer === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="map-tools">
        <button aria-label="Zoomer" onClick={() => map.current?.zoomIn()}>
          <Plus size={17} />
        </button>
        <button aria-label="Dézoomer" onClick={() => map.current?.zoomOut()}>
          <Minus size={17} />
        </button>
        <button
          aria-label="Recentrer sur l’adresse"
          onClick={() => map.current?.setView([address.lat, address.lon], 16)}
        >
          <LocateFixed size={17} />
        </button>
      </div>
      <div className="map-caption">
        {tileError
          ? "Fond de carte indisponible · lieux consultables dans la fiche"
          : "Autour de l’adresse · rayon de 200 m"}
      </div>
    </div>
  );
}
