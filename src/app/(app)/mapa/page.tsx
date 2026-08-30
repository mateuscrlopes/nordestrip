import { RecordActions } from "@/components/actions/record-actions";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripPlaces, getTripStops, getTripTransports } from "@/lib/queries/trips";
import type { Transport } from "@/types/trip";
import { Check, ExternalLink, MapPin, Navigation, Route } from "lucide-react";

function coordinateValue(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapsUrl(latitude: unknown, longitude: unknown, address?: unknown) {
  const lat = coordinateValue(latitude);
  const lng = coordinateValue(longitude);

  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  if (typeof address === "string" && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }

  return null;
}

function hasCoordinates(latitude: unknown, longitude: unknown) {
  return coordinateValue(latitude) != null && coordinateValue(longitude) != null;
}

function placeMetadata(place: Record<string, unknown>) {
  const value = place.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function coordinateConfidence(place: Record<string, unknown>) {
  const value = placeMetadata(place).coordinates_confidence;
  return value === "verified" ? "verified" : value === "approximate" ? "approximate" : null;
}

function circuitLabel(place: Record<string, unknown>) {
  const value = placeMetadata(place).circuit_label;
  return typeof value === "string" && value ? value : null;
}

function directionsUrl(places: Record<string, unknown>[]) {
  const located = places.filter((place) => hasCoordinates(place.latitude, place.longitude));
  if (located.length < 2) return null;

  const point = (place: Record<string, unknown>) =>
    `${coordinateValue(place.latitude)},${coordinateValue(place.longitude)}`;

  const origin = point(located[0]);
  const destination = point(located[located.length - 1]);
  const waypoints = located.slice(1, -1).map(point).join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "walking",
  });
  if (waypoints) params.set("waypoints", waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

type OperationalLocation = {
  id: string;
  name: string;
  address: string | null;
  route: string;
  kind: "Terminal de saída" | "Terminal de chegada";
  searchQuery: string;
};

function transportLocations(transports: Transport[]): OperationalLocation[] {
  return transports
    .filter((transport) => transport.status !== "cancelled")
    .flatMap((transport) => {
    const route = [transport.origin_label, transport.destination_label].filter(Boolean).join(" → ") || "Deslocamento";
    const rows: OperationalLocation[] = [];

    if (transport.origin_terminal_name || transport.origin_terminal_address) {
      const name = transport.origin_terminal_name || `Saída em ${transport.origin_label || "terminal"}`;
      rows.push({
        id: `${transport.id}-origin`,
        name,
        address: transport.origin_terminal_address || null,
        route,
        kind: "Terminal de saída",
        searchQuery: [name, transport.origin_label].filter(Boolean).join(", "),
      });
    }

    if (transport.destination_terminal_name || transport.destination_terminal_address) {
      const name = transport.destination_terminal_name || `Chegada em ${transport.destination_label || "terminal"}`;
      rows.push({
        id: `${transport.id}-destination`,
        name,
        address: transport.destination_terminal_address || null,
        route,
        kind: "Terminal de chegada",
        searchQuery: [name, transport.destination_label].filter(Boolean).join(", "),
      });
    }

    return rows;
  });
}

export default async function MapPage() {
  const { trip } = await getCurrentTrip();
  const [places, stops, transports] = trip
    ? await Promise.all([getTripPlaces(trip.id), getTripStops(trip.id), getTripTransports(trip.id)])
    : [[], [], []];

  const operationalLocations = transportLocations(transports);
  const withCoordinates = places.filter((place) => hasCoordinates(place.latitude, place.longitude));
  const addressOnly = places.filter(
    (place) => !hasCoordinates(place.latitude, place.longitude) && Boolean(place.address)
  );
  const references = places.filter((place) => !hasCoordinates(place.latitude, place.longitude) && !place.address);
  const coordinateCoverage = places.length ? Math.round((withCoordinates.length / places.length) * 100) : 0;
  const stopById = new Map(stops.map((stop) => [stop.id, stop.city || stop.name || "Cidade"]));

  const coordinateByCity = stops.map((stop) => {
    const cityPlaces = places.filter((place) => place.stop_id === stop.id);
    const locatedCount = cityPlaces.filter((place) => hasCoordinates(place.latitude, place.longitude)).length;
    return {
      id: stop.id,
      city: stop.city || stop.name || "Cidade",
      total: cityPlaces.length,
      located: locatedCount,
    };
  }).filter((item) => item.total > 0);

  const circuitGroups = Array.from(
    withCoordinates.reduce<Map<string, { city: string; label: string; places: Record<string, unknown>[] }>>(
      (groups, place) => {
        const label = circuitLabel(place);
        const stopId = typeof place.stop_id === "string" ? place.stop_id : null;
        if (!label || !stopId) return groups;

        const category = typeof place.category === "string" ? place.category : "";
        if (category === "excursion") return groups;

        const key = `${stopId}::${label}`;
        const current = groups.get(key) ?? {
          city: stopById.get(stopId) || "Cidade",
          label,
          places: [],
        };
        current.places.push(place);
        groups.set(key, current);
        return groups;
      },
      new Map()
    ).values()
  )
    .map((group) => ({
      ...group,
      places: [...group.places].sort((a, b) => {
        const aOrder = Number(placeMetadata(a).circuit_order ?? 999);
        const bOrder = Number(placeMetadata(b).circuit_order ?? 999);
        return aOrder - bOrder;
      }),
    }))
    .filter((group) => group.places.length >= 2);

  return (
    <>
      <PageHeader
        title="Mapa"
        description="Rota da viagem e lugares salvos, mesmo antes de terem coordenadas."
      />

      <div className="space-y-7">
        <section>
          <div className="section-heading">
            <h2>Rota da viagem</h2>
          </div>
          <div className="trip-route-strip" aria-label="Sequência de cidades">
            {stops.map((stop, index) => (
              <div key={stop.id} className="trip-route-node">
                <span>{index + 1}</span>
                <p>{stop.city || stop.name || "Cidade"}</p>
                {index < stops.length - 1 && <i aria-hidden="true" />}
              </div>
            ))}
          </div>
        </section>

        <section className="map-integration-panel">
          <div className="flex items-start gap-4">
            <span className="map-integration-icon"><Navigation size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2>Geografia do roteiro</h2>
              <p>
                {withCoordinates.length} de {places.length} locais já têm coordenadas ({coordinateCoverage}%).
                A navegação externa funciona agora; tempos de rota internos aguardam a configuração do provedor de mapas.
              </p>
              <div className="map-coverage-bar" aria-label={`${coordinateCoverage}% dos locais com coordenadas`}>
                <span style={{ width: `${coordinateCoverage}%` }} />
              </div>
              <div className="map-coverage-cities">
                {coordinateByCity.map((item) => (
                  <span key={item.id}>
                    {item.city} · {item.located}/{item.total}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {circuitGroups.length > 0 && (
          <section>
            <div className="section-heading">
              <h2>Circuitos georreferenciados</h2>
            </div>
            <div className="map-circuit-list">
              {circuitGroups.map((circuit) => {
                const url = directionsUrl(circuit.places);
                return (
                  <div key={`${circuit.city}-${circuit.label}`} className="map-circuit-card">
                    <span className="map-circuit-icon"><Route size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <strong>{circuit.label}</strong>
                      <small>{circuit.city} · {circuit.places.length} pontos georreferenciados</small>
                    </div>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" aria-label={`Abrir circuito ${circuit.label} no Google Maps`}>
                        <Navigation size={16} />
                        Abrir rota
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="map-circuit-note">
              A rota externa usa o modo a pé. Circuitos de passeio/embarcação não entram nessa lista.
            </p>
          </section>
        )}

        {operationalLocations.length > 0 && (
          <section>
            <div className="section-heading">
              <h2>Locais operacionais</h2>
            </div>
            <div className="place-list">
              {operationalLocations.map((location) => {
                const url = mapsUrl(
                  null,
                  null,
                  location.address || location.searchQuery,
                );

                return (
                  <div key={location.id} className="place-row">
                    <span className="operational-icon operational-icon--light"><Navigation size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{location.name}</p>
                      <p className="mt-1 text-[12px] leading-5 text-muted">{location.route}</p>
                      {location.address ? (
                        <p className="mt-1 text-[12px] leading-5 text-muted">{location.address}</p>
                      ) : (
                        <span className="place-location-chip">Endereço pendente</span>
                      )}
                      <span className="place-location-chip">{location.kind}</span>
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir ${location.name} no mapa`}
                        className="map-external-link"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="section-heading">
            <h2>Coordenadas salvas</h2>
          </div>

          {withCoordinates.length > 0 ? (
            <div className="place-list">
              {withCoordinates.map((place, index) => {
                const url = mapsUrl(place.latitude, place.longitude, place.address);
                return (
                  <PlaceRow key={String(place.id ?? index)} place={place} url={url} />
                );
              })}
            </div>
          ) : (
            <div className="empty-surface">
              <MapPin size={20} />
              <p>Nenhuma coordenada salva ainda.</p>
            </div>
          )}
        </section>

        {addressOnly.length > 0 && (
          <section>
            <div className="section-heading">
              <h2>Somente endereço</h2>
            </div>
            <div className="place-list">
              {addressOnly.map((place, index) => (
                <PlaceRow
                  key={String(place.id ?? index)}
                  place={place}
                  url={mapsUrl(null, null, place.address)}
                  addressOnly
                />
              ))}
            </div>
          </section>
        )}

        {references.length > 0 && (
          <section>
            <div className="section-heading">
              <h2>Referências para localizar</h2>
            </div>
            <div className="place-list">
              {references.map((place, index) => (
                <PlaceRow
                  key={String(place.id ?? index)}
                  place={place}
                  url={typeof place.source_url === "string" ? place.source_url : null}
                  referenceOnly
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function PlaceRow({
  place,
  url,
  referenceOnly = false,
  addressOnly = false,
}: {
  place: Record<string, unknown>;
  url: string | null;
  referenceOnly?: boolean;
  addressOnly?: boolean;
}) {
  return (
    <div className="place-row">
      <span className="operational-icon operational-icon--light"><MapPin size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{String(place.name ?? place.title ?? "Lugar salvo")}</p>
        {place.address ? (
          <p className="mt-1 text-[12px] leading-5 text-muted">{String(place.address)}</p>
        ) : (
          <p className="mt-1 text-[12px] leading-5 text-muted">
            {referenceOnly ? "Ainda sem endereço ou coordenadas." : "Localização salva."}
          </p>
        )}
        <div className="map-place-chips">
          {circuitLabel(place) && <span className="place-location-chip">{circuitLabel(place)}</span>}
          {coordinateConfidence(place) === "verified" && (
            <span className="place-location-chip place-location-chip--verified"><Check size={11} /> Coordenada verificada</span>
          )}
          {coordinateConfidence(place) === "approximate" && (
            <span className="place-location-chip place-location-chip--approx">Coordenada aproximada</span>
          )}
          {addressOnly && <span className="place-location-chip">Coordenada pendente</span>}
          {referenceOnly && <span className="place-location-chip">Precisa localizar</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={referenceOnly ? "Abrir referência" : "Abrir localização"}
            className="map-external-link"
          >
            <ExternalLink size={16} />
          </a>
        )}
        <RecordActions
          table="places"
          id={String(place.id)}
          title={String(place.name ?? place.title ?? "Lugar salvo")}
          fields={[
            { name: "name", label: "Nome", required: true },
            { name: "category", label: "Categoria" },
            { name: "address", label: "Endereço" },
            { name: "latitude", label: "Latitude", type: "number", step: "0.000001" },
            { name: "longitude", label: "Longitude", type: "number", step: "0.000001" },
            { name: "source_url", label: "Link", type: "url" },
            { name: "notes", label: "Nota", type: "textarea" },
          ]}
          values={{
            name: String(place.name ?? place.title ?? ""),
            category: typeof place.category === "string" ? place.category : null,
            address: typeof place.address === "string" ? place.address : null,
            latitude: coordinateValue(place.latitude),
            longitude: coordinateValue(place.longitude),
            source_url: typeof place.source_url === "string" ? place.source_url : null,
            notes: typeof place.notes === "string" ? place.notes : null,
          }}
        />
      </div>
    </div>
  );
}
