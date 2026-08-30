"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type MapPlace = {
  id: string;
  stopId: string;
  city: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  circuit: string | null;
  circuitOrder: number;
  confidence: "verified" | "approximate" | null;
};

function googleMapsUrl(place: MapPlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.latitude},${place.longitude}`
  )}`;
}

export function TripMap({ places }: { places: MapPlace[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [city, setCity] = useState("all");
  const [circuit, setCircuit] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(places[0]?.id ?? null);

  const cities = useMemo(
    () => Array.from(new Set(places.map((place) => place.city))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [places]
  );

  const cityPlaces = useMemo(
    () => city === "all" ? places : places.filter((place) => place.city === city),
    [city, places]
  );

  const circuits = useMemo(
    () =>
      Array.from(
        new Set(cityPlaces.map((place) => place.circuit).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [cityPlaces]
  );

  const visiblePlaces = useMemo(
    () => circuit === "all" ? cityPlaces : cityPlaces.filter((place) => place.circuit === circuit),
    [circuit, cityPlaces]
  );

  const selected = places.find((place) => place.id === selectedId) ?? null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([-8.5, -40], 5);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    import("leaflet").then((L) => {
      const bounds: [number, number][] = [];

      const grouped = visiblePlaces.reduce<Map<string, MapPlace[]>>((groups, place) => {
        if (!place.circuit || place.category === "excursion") return groups;
        const key = `${place.stopId}::${place.circuit}`;
        const current = groups.get(key) ?? [];
        current.push(place);
        groups.set(key, current);
        return groups;
      }, new Map());

      for (const group of grouped.values()) {
        const sorted = [...group].sort((a, b) => a.circuitOrder - b.circuitOrder);
        if (sorted.length >= 2) {
          L.polyline(
            sorted.map((place) => [place.latitude, place.longitude] as [number, number]),
            {
              color: "#537985",
              weight: 3,
              opacity: .5,
              dashArray: "7 7",
            }
          ).addTo(layer);
        }
      }

      visiblePlaces.forEach((place) => {
        bounds.push([place.latitude, place.longitude]);

        const marker = L.circleMarker([place.latitude, place.longitude], {
          radius: selectedId === place.id ? 9 : 7,
          color: "#123844",
          weight: selectedId === place.id ? 3 : 2,
          fillColor: place.confidence === "approximate" ? "#d7b483" : "#ffffff",
          fillOpacity: 1,
        }).addTo(layer);

        const popup = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = place.name;
        popup.appendChild(strong);
        if (place.circuit) {
          const detail = document.createElement("div");
          detail.textContent = place.circuit;
          detail.style.marginTop = "4px";
          detail.style.fontSize = "11px";
          popup.appendChild(detail);
        }

        marker.bindPopup(popup);
        marker.on("click", () => setSelectedId(place.id));
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      }
    });
  }, [selectedId, visiblePlaces]);

  function changeCity(value: string) {
    setCity(value);
    setCircuit("all");
    const next = value === "all" ? places[0] : places.find((place) => place.city === value);
    setSelectedId(next?.id ?? null);
  }

  function changeCircuit(value: string) {
    setCircuit(value);
    const next = value === "all"
      ? cityPlaces[0]
      : cityPlaces.find((place) => place.circuit === value);
    setSelectedId(next?.id ?? null);
  }

  return (
    <div className="trip-map-shell">
      <div className="trip-map-toolbar">
        <label className="trip-map-filter">
          <span>Cidade</span>
          <select value={city} onChange={(event) => changeCity(event.target.value)}>
            <option value="all">Todas as cidades</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="trip-map-filter">
          <span>Circuito</span>
          <select value={circuit} onChange={(event) => changeCircuit(event.target.value)}>
            <option value="all">Todos os circuitos</option>
            {circuits.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div ref={containerRef} className="trip-map-canvas" aria-label="Mapa interativo dos locais da viagem" />

      {selected && (
        <div className="trip-map-selected">
          <strong>{selected.name}</strong>
          {selected.address && <p>{selected.address}</p>}
          <div className="trip-map-selected-meta">
            <span>{selected.city}</span>
            {selected.circuit && <span>{selected.circuit}</span>}
            <span>{selected.confidence === "approximate" ? "Coordenada aproximada" : "Coordenada verificada"}</span>
          </div>
          <a href={googleMapsUrl(selected)} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Abrir no Google Maps
          </a>
        </div>
      )}

      <p className="trip-map-note">
        As linhas tracejadas mostram a sequência aproximada dos circuitos. O caminho por ruas e o tempo real de deslocamento serão calculados quando o provedor de rotas estiver configurado.
      </p>
    </div>
  );
}
