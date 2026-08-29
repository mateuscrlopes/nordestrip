import { RecordActions } from "@/components/actions/record-actions";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripPlaces, getTripStops, getTripTransports } from "@/lib/queries/trips";
import type { Transport } from "@/types/trip";
import { ExternalLink, MapPin, Navigation } from "lucide-react";

function mapsUrl(latitude: unknown, longitude: unknown, address?: unknown) {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  if (typeof address === "string" && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }

  return null;
}

function hasCoordinates(latitude: unknown, longitude: unknown) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
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
  return transports.flatMap((transport) => {
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
  const located = places.filter((place) => hasCoordinates(place.latitude, place.longitude) || Boolean(place.address));
  const references = places.filter((place) => !hasCoordinates(place.latitude, place.longitude) && !place.address);

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
            <div>
              <h2>Mapa integrado ainda não configurado</h2>
              <p>
                O Nordestrip já centraliza endereços e referências. Quando houver coordenadas ou endereço, a localização pode ser aberta diretamente no Google Maps.
              </p>
            </div>
          </div>
        </section>

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
            <h2>Lugares com localização</h2>
          </div>

          {located.length > 0 ? (
            <div className="place-list">
              {located.map((place, index) => {
                const url = mapsUrl(place.latitude, place.longitude, place.address);
                return (
                  <PlaceRow key={String(place.id ?? index)} place={place} url={url} />
                );
              })}
            </div>
          ) : (
            <div className="empty-surface">
              <MapPin size={20} />
              <p>Nenhum endereço ou coordenada salvo ainda.</p>
            </div>
          )}
        </section>

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
}: {
  place: Record<string, unknown>;
  url: string | null;
  referenceOnly?: boolean;
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
        {referenceOnly && <span className="place-location-chip">Precisa localizar</span>}
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
            { name: "source_url", label: "Link", type: "url" },
            { name: "notes", label: "Nota", type: "textarea" },
          ]}
          values={{
            name: String(place.name ?? place.title ?? ""),
            category: typeof place.category === "string" ? place.category : null,
            address: typeof place.address === "string" ? place.address : null,
            source_url: typeof place.source_url === "string" ? place.source_url : null,
            notes: typeof place.notes === "string" ? place.notes : null,
          }}
        />
      </div>
    </div>
  );
}
