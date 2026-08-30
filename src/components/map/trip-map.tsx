"use client";

import { createClient } from "@/lib/supabase/client";
import { ExternalLink, Navigation, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type LatLngLiteral = { lat: number; lng: number };

type GoogleMapInstance = {
  setCenter: (position: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleBoundsInstance, padding?: number) => void;
};

type GoogleBoundsInstance = {
  extend: (position: LatLngLiteral) => void;
};

type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  addListener: (event: string, handler: () => void) => void;
};

type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
};

type GoogleInfoWindowInstance = {
  close: () => void;
  setContent: (content: Node | string) => void;
  open: (options: { map: GoogleMapInstance; anchor: GoogleMarkerInstance }) => void;
};

type GoogleRouteInstance = {
  distanceMeters?: number;
  durationMillis?: number;
  createPolylines: (options?: { polylineOptions?: Record<string, unknown> }) => GooglePolylineInstance[];
};

type GoogleRoutesLibrary = {
  Route: {
    computeRoutes: (request: {
      origin: LatLngLiteral;
      destination: LatLngLiteral;
      intermediates?: Array<{ location: LatLngLiteral }>;
      travelMode: "WALKING";
      fields: string[];
    }) => Promise<{ routes: GoogleRouteInstance[] }>;
  };
};

type GoogleMapsRuntime = {
  importLibrary: (name: string) => Promise<unknown>;
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds: new () => GoogleBoundsInstance;
  InfoWindow: new () => GoogleInfoWindowInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  SymbolPath: { CIRCLE: unknown };
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsRuntime };
    __nordestripGoogleMapsPromise?: Promise<void>;
    __nordestripGoogleMapsReady?: () => void;
  }
}

type RouteSummary = {
  distanceMeters: number;
  durationMillis: number;
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

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
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

async function saveRouteEstimate(
  tripId: string,
  routePlaces: MapPlace[],
  circuitLabel: string,
  distanceMeters: number,
  durationMillis: number
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
            duration_minutes: Math.max(1, Math.round(durationMillis / 60000)),
            source: "google_routes",
            travel_mode: "walking",
            calculated_at: new Date().toISOString(),
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("trip_id", tripId);
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só pode ser carregado no navegador."));
  }

  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (window.__nordestripGoogleMapsPromise) return window.__nordestripGoogleMapsPromise;

  window.__nordestripGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const callbackName = "__nordestripGoogleMapsReady";

    window.__nordestripGoogleMapsReady = () => {
      resolve();
      delete window.__nordestripGoogleMapsReady;
    };

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callbackName}`;

    script.onerror = () => {
      window.__nordestripGoogleMapsPromise = undefined;
      reject(new Error("Não foi possível carregar o Google Maps."));
    };

    document.head.appendChild(script);
  });

  return window.__nordestripGoogleMapsPromise;
}

export function TripMap({
  places,
  apiKey,
  tripId,
}: {
  places: MapPlace[];
  apiKey: string;
  tripId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindowInstance | null>(null);
  const renderVersionRef = useRef(0);

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
    if (!apiKey || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !containerRef.current || mapRef.current || !window.google?.maps) return;

        const maps = window.google.maps;
        await maps.importLibrary("maps");

        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: -8.5, lng: -40 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });

        infoWindowRef.current = new maps.InfoWindow();
        setMapReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "Não foi possível carregar o Google Maps.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = window.google?.maps;

    if (!mapReady || !map || !maps) return;

    const renderVersion = ++renderVersionRef.current;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    infoWindowRef.current?.close();
    setRouteSummary(null);
    setRouteState(circuit === "all" ? "idle" : "loading");

    const bounds = new maps.LatLngBounds();

    const grouped = visiblePlaces.reduce<Map<string, MapPlace[]>>((groups, place) => {
      if (!place.circuit || place.category === "excursion") return groups;

      const key = `${place.stopId}::${place.circuit}`;
      const current = groups.get(key) ?? [];
      current.push(place);
      groups.set(key, current);

      return groups;
    }, new Map());

    const drawFallbackLines = () => {
      grouped.forEach((group) => {
        const sorted = [...group].sort((a, b) => a.circuitOrder - b.circuitOrder);
        if (sorted.length < 2) return;

        const polyline = new maps.Polyline({
          map,
          path: sorted.map((place) => ({ lat: place.latitude, lng: place.longitude })),
          strokeColor: "#537985",
          strokeOpacity: 0.48,
          strokeWeight: 3,
        });

        polylinesRef.current.push(polyline);
      });
    };

    visiblePlaces.forEach((place) => {
      const position = { lat: place.latitude, lng: place.longitude };
      bounds.extend(position);

      const marker = new maps.Marker({
        position,
        map,
        title: place.name,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: place.confidence === "approximate" ? "#D7B483" : "#FFFFFF",
          fillOpacity: 1,
          strokeColor: "#123844",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => {
        setSelectedId(place.id);

        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = place.name;
        popup.appendChild(title);

        if (place.circuit) {
          const detail = document.createElement("div");
          detail.textContent = place.circuit;
          detail.style.marginTop = "4px";
          detail.style.fontSize = "11px";
          popup.appendChild(detail);
        }

        infoWindowRef.current?.setContent(popup);
        infoWindowRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    });

    const drawRealRoute = async () => {
      if (circuit === "all") {
        drawFallbackLines();
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

      try {
        const routesLibrary = await maps.importLibrary("routes") as GoogleRoutesLibrary;
        const first = routePlaces[0];
        const last = routePlaces[routePlaces.length - 1];

        const { routes } = await routesLibrary.Route.computeRoutes({
          origin: { lat: first.latitude, lng: first.longitude },
          destination: { lat: last.latitude, lng: last.longitude },
          intermediates: routePlaces.slice(1, -1).map((place) => ({
            location: { lat: place.latitude, lng: place.longitude },
          })),
          travelMode: "WALKING",
          fields: ["path", "distanceMeters", "durationMillis"],
        });

        if (renderVersion !== renderVersionRef.current) return;

        const route = routes[0];

        if (!route) {
          drawFallbackLines();
          setRouteState("unavailable");
          return;
        }

        const routePolylines = route.createPolylines({
          polylineOptions: {
            strokeColor: "#123844",
            strokeOpacity: 0.82,
            strokeWeight: 4,
          },
        });

        routePolylines.forEach((polyline) => {
          polyline.setMap(map);
          polylinesRef.current.push(polyline);
        });

        const distanceMeters = Number(route.distanceMeters || 0);
        const durationMillis = Number(route.durationMillis || 0);

        setRouteSummary({ distanceMeters, durationMillis });
        setRouteState("ready");

        if (usingPrincipals && circuit !== "all") {
          void saveRouteEstimate(
            tripId,
            routePlaces,
            circuit,
            distanceMeters,
            durationMillis
          );
        }
      } catch {
        if (renderVersion !== renderVersionRef.current) return;
        drawFallbackLines();
        setRouteState("unavailable");
      }
    };

    void drawRealRoute();

    if (visiblePlaces.length === 1) {
      map.setCenter({ lat: visiblePlaces[0].latitude, lng: visiblePlaces[0].longitude });
      map.setZoom(15);
    } else if (visiblePlaces.length > 1) {
      map.fitBounds(bounds, 36);
    }
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

  if (!apiKey) {
    return (
      <div className="trip-map-setup">
        <TriangleAlert size={18} />
        <div>
          <strong>Google Maps ainda sem chave no deploy</strong>
          <p>Confirme NEXT_PUBLIC_GOOGLE_MAPS_API_KEY nas variáveis de ambiente da Netlify.</p>
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
            <strong>Não foi possível carregar o Google Maps</strong>
            <p>{mapError} Verifique faturamento, APIs habilitadas e restrições da chave.</p>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="trip-map-canvas"
          aria-label="Google Maps interativo dos locais da viagem"
        />
      )}

      {circuit !== "all" && (
        <div className="trip-map-route-summary">
          <span className="trip-map-route-icon"><Navigation size={15} /></span>
          <div>
            <strong>
              {routeState === "loading" && "Calculando rota a pé..."}
              {routeState === "ready" && routeSummary &&
                `${formatDistance(routeSummary.distanceMeters)} · ${formatDuration(routeSummary.durationMillis)} a pé`}
              {routeState === "unavailable" && "Rota real indisponível"}
              {routeState === "idle" && "Selecione um circuito com pelo menos dois pontos"}
            </strong>
            <small>
              {routeState === "ready"
                ? "Tempo e distância calculados pelo Google para o núcleo principal do circuito."
                : routeState === "unavailable"
                  ? "A sequência aproximada continua visível; confira se a Routes API está habilitada."
                  : "O cálculo só é feito para o circuito selecionado."}
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
        Ao selecionar um circuito, o Nordestrip solicita ao Google a rota real a pé. Sem circuito selecionado, as linhas mostram apenas a sequência planejada.
      </p>
    </div>
  );
}
