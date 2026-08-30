"use client";

import { createClient } from "@/lib/supabase/client";
import maplibregl, { type Map as MapLibreMap, type Marker, type Popup } from "maplibre-gl";
import { ExternalLink, Navigation, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type RouteSummary = {
  distanceMeters: number;
  durationSeconds: number;
};

type RouteResponse = RouteSummary & {
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  provider: "openrouteservice";
  profile: "foot-walking";
};

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
  priority: string | null;
  period: string | null;
  itineraryStatus: string | null;
};

type MarkerEntry = {
  marker: Marker;
  element: HTMLButtonElement;
};

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${minutes} min`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

function googleMapsUrl(place: MapPlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.latitude},${place.longitude}`
  )}`;
}

function removeMapData(map: MapLibreMap, layerId: string, sourceId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function sequenceGeoJson(places: MapPlace[]) {
  const grouped = places.reduce<Map<string, MapPlace[]>>((groups, place) => {
    if (!place.circuit || place.category === "excursion") return groups;

    const key = `${place.stopId}::${place.circuit}`;
    const current = groups.get(key) ?? [];
    current.push(place);
    groups.set(key, current);
    return groups;
  }, new Map());

  return {
    type: "FeatureCollection" as const,
    features: Array.from(grouped.values())
      .map((group) => [...group].sort((a, b) => a.circuitOrder - b.circuitOrder))
      .filter((group) => group.length >= 2)
      .map((group) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: group.map((place) => [place.longitude, place.latitude]),
        },
      })),
  };
}

async function saveRouteEstimate(
  tripId: string,
  routePlaces: MapPlace[],
  circuitLabel: string,
  distanceMeters: number,
  durationSeconds: number
) {
  const stopId = routePlaces[0]?.stopId;
  const periods = new Set(
    routePlaces
      .map((place) => place.period)
      .filter((value): value is string => Boolean(value))
  );

  if (!stopId || periods.size !== 1) return;

  const period = Array.from(periods)[0];
  const placeIds = routePlaces.map((place) => place.id);
  const supabase = createClient();

  const { data, error: readError } = await supabase
    .from("trip_preferences")
    .select("extra")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (readError) return;

  const extra =
    data?.extra && typeof data.extra === "object" && !Array.isArray(data.extra)
      ? data.extra as Record<string, unknown>
      : {};
  const rawEstimates = extra.route_estimates;
  const estimates =
    rawEstimates && typeof rawEstimates === "object" && !Array.isArray(rawEstimates)
      ? rawEstimates as Record<string, unknown>
      : {};
  const key = `${stopId}::${circuitLabel}::${period}`;

  await supabase
    .from("trip_preferences")
    .update({
      extra: {
        ...extra,
        route_estimates: {
          ...estimates,
          [key]: {
            stop_id: stopId,
            circuit_label: circuitLabel,
            period,
            place_ids: placeIds,
            distance_meters: Math.round(distanceMeters),
            duration_minutes: Math.max(1, Math.round(durationSeconds / 60)),
            source: "openrouteservice",
            travel_mode: "walking",
            calculated_at: new Date().toISOString(),
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("trip_id", tripId);
}

export function TripMap({
  places,
  mapTilerKey,
  tripId,
}: {
  places: MapPlace[];
  mapTilerKey: string;
  tripId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const popupRef = useRef<Popup | null>(null);

  const [city, setCity] = useState("all");
  const [circuit, setCircuit] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(places[0]?.id ?? null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

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
    if (!mapTilerKey || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapTilerKey)}`,
      center: [-40, -8.5],
      zoom: 4.2,
      attributionControl: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      "top-right"
    );

    map.on("load", () => setMapReady(true));
    map.on("error", (event) => {
      const message = event.error?.message || "";
      if (message) setMapError(message);
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [mapTilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();
    popupRef.current?.remove();
    popupRef.current = null;

    removeMapData(map, "trip-sequence-line", "trip-sequence");
    removeMapData(map, "trip-route-line", "trip-route");

    const sequence = sequenceGeoJson(visiblePlaces);
    if (sequence.features.length > 0) {
      map.addSource("trip-sequence", {
        type: "geojson",
        data: sequence,
      });
      map.addLayer({
        id: "trip-sequence-line",
        type: "line",
        source: "trip-sequence",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#537985",
          "line-opacity": 0.46,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
    }

    const bounds = new maplibregl.LngLatBounds();

    visiblePlaces.forEach((place) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = [
        "trip-map-marker",
        place.confidence === "approximate" ? "trip-map-marker--approx" : "",
        selectedId === place.id ? "is-selected" : "",
      ].filter(Boolean).join(" ");
      element.setAttribute("aria-label", place.name);

      element.addEventListener("click", () => {
        setSelectedId(place.id);

        const popup = document.createElement("div");
        popup.className = "trip-map-popup";

        const title = document.createElement("strong");
        title.textContent = place.name;
        popup.appendChild(title);

        if (place.circuit) {
          const detail = document.createElement("span");
          detail.textContent = place.circuit;
          popup.appendChild(detail);
        }

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          offset: 16,
          closeButton: false,
          closeOnClick: true,
        })
          .setLngLat([place.longitude, place.latitude])
          .setDOMContent(popup)
          .addTo(map);
      });

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);

      markersRef.current.set(place.id, { marker, element });
      bounds.extend([place.longitude, place.latitude]);
    });

    if (visiblePlaces.length === 1) {
      map.jumpTo({
        center: [visiblePlaces[0].longitude, visiblePlaces[0].latitude],
        zoom: 15,
      });
    } else if (visiblePlaces.length > 1) {
      map.fitBounds(bounds, {
        padding: 38,
        maxZoom: 16,
        duration: 0,
      });
    }
  }, [mapReady, visiblePlaces]);

  useEffect(() => {
    markersRef.current.forEach(({ element }, placeId) => {
      element.classList.toggle("is-selected", selectedId === placeId);
    });
  }, [selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    removeMapData(map, "trip-route-line", "trip-route");
    setRouteSummary(null);

    if (circuit === "all") {
      setRouteState("idle");
      return;
    }

    const eligiblePlaces = [...visiblePlaces]
      .filter((place) => place.category !== "excursion" && place.itineraryStatus !== "cancelled")
      .sort((a, b) => a.circuitOrder - b.circuitOrder);
    const principalPlaces = eligiblePlaces.filter((place) => place.priority === "high");
    const usingPrincipals = principalPlaces.length >= 2;
    const routePlaces = usingPrincipals ? principalPlaces : eligiblePlaces;

    if (routePlaces.length < 2) {
      setRouteState("idle");
      return;
    }

    const controller = new AbortController();
    setRouteState("loading");

    void fetch("/api/maps/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: routePlaces.map((place) => [place.longitude, place.latitude]),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("route-unavailable");
        return response.json() as Promise<RouteResponse>;
      })
      .then((route) => {
        if (controller.signal.aborted || !mapRef.current) return;

        const coordinates = route.geometry.coordinates.filter(
          (point): point is [number, number] =>
            Array.isArray(point) &&
            point.length >= 2 &&
            typeof point[0] === "number" &&
            typeof point[1] === "number"
        );

        if (coordinates.length < 2) throw new Error("invalid-route");

        removeMapData(map, "trip-route-line", "trip-route");
        map.addSource("trip-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#123844",
            "line-opacity": 0.88,
            "line-width": 5,
          },
        });

        setRouteSummary({
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
        });
        setRouteState("ready");

        if (usingPrincipals) {
          void saveRouteEstimate(
            tripId,
            routePlaces,
            circuit,
            route.distanceMeters,
            route.durationSeconds
          );
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRouteState("unavailable");
        if (error instanceof Error && error.message !== "route-unavailable") {
          console.warn("Falha ao renderizar rota do circuito.", error);
        }
      });

    return () => controller.abort();
  }, [circuit, mapReady, tripId, visiblePlaces]);

  function changeCity(value: string) {
    setCity(value);
    setCircuit("all");

    const next = value === "all"
      ? places[0]
      : places.find((place) => place.city === value);

    setSelectedId(next?.id ?? null);
  }

  function changeCircuit(value: string) {
    setCircuit(value);

    const next = value === "all"
      ? cityPlaces[0]
      : cityPlaces.find((place) => place.circuit === value);

    setSelectedId(next?.id ?? null);
  }

  if (!mapTilerKey) {
    return (
      <div className="trip-map-setup">
        <TriangleAlert size={18} />
        <div>
          <strong>Mapa interno ainda sem chave</strong>
          <p>Confirme NEXT_PUBLIC_MAPTILER_KEY nas variáveis de ambiente da Netlify.</p>
        </div>
      </div>
    );
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

      {mapError ? (
        <div className="trip-map-error">
          <TriangleAlert size={18} />
          <div>
            <strong>Não foi possível carregar o mapa</strong>
            <p>{mapError} Verifique a chave do MapTiler e as origens permitidas.</p>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="trip-map-canvas"
          aria-label="Mapa interativo dos locais da viagem"
        />
      )}

      {circuit !== "all" && (
        <div className="trip-map-route-summary">
          <span className="trip-map-route-icon"><Navigation size={15} /></span>
          <div>
            <strong>
              {routeState === "loading" && "Calculando rota a pé..."}
              {routeState === "ready" && routeSummary &&
                `${formatDistance(routeSummary.distanceMeters)} · ${formatDuration(routeSummary.durationSeconds)} a pé`}
              {routeState === "unavailable" && "Rota real indisponível"}
              {routeState === "idle" && "Selecione um circuito com pelo menos dois pontos"}
            </strong>
            <small>
              {routeState === "ready"
                ? "Distância e tempo calculados pelo openrouteservice para o núcleo principal."
                : routeState === "unavailable"
                  ? "A sequência aproximada permanece visível; tente novamente mais tarde."
                  : "O cálculo acontece somente para o circuito selecionado."}
            </small>
          </div>
        </div>
      )}

      {selected && (
        <div className="trip-map-selected">
          <strong>{selected.name}</strong>

          {selected.address && <p>{selected.address}</p>}

          <div className="trip-map-selected-meta">
            <span>{selected.city}</span>
            {selected.circuit && <span>{selected.circuit}</span>}
            <span>
              {selected.confidence === "approximate"
                ? "Coordenada aproximada"
                : "Coordenada verificada"}
            </span>
          </div>

          <a href={googleMapsUrl(selected)} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Abrir no Google Maps
          </a>
        </div>
      )}

      <p className="trip-map-note">
        O mapa usa MapTiler dentro do Nordestrip. Ao selecionar um circuito, a linha sólida representa a rota real a pé calculada pelo openrouteservice; sem circuito, a linha tracejada mostra apenas a sequência planejada.
      </p>
    </div>
  );
}
