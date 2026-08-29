import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripPlaces, getTripStops } from "@/lib/queries/trips";
import { ExternalLink, MapPin, Navigation } from "lucide-react";

function mapsUrl(latitude: unknown, longitude: unknown) {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

export default async function MapPage() {
  const { trip } = await getCurrentTrip();
  const [places, stops] = trip
    ? await Promise.all([getTripPlaces(trip.id), getTripStops(trip.id)])
    : [[], []];

  return (
    <>
      <PageHeader
        title="Mapa"
        description="Rota da viagem e lugares que já têm localização salva."
      />

      <div className="space-y-7">
        <section>
          <div className="section-heading">
            <h2>Rota da viagem</h2>
          </div>
          <div className="trip-route-strip" aria-label="Sequência de cidades">
            {stops.map((stop, index) => (
              <div key={stop.id} className="trip-route-node">
                <span>{stop.sequence ?? index + 1}</span>
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
                Os endereços e coordenadas já ficam salvos no Nordestrip. A navegação pode ser aberta no Google Maps pelos lugares abaixo.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2>Lugares salvos</h2>
          </div>

          {places.length > 0 ? (
            <div className="place-list">
              {places.map((place, index) => {
                const url = mapsUrl(place.latitude, place.longitude);
                return (
                  <div key={String(place.id ?? index)} className="place-row">
                    <span className="operational-icon operational-icon--light"><MapPin size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{String(place.name ?? place.title ?? "Lugar salvo")}</p>
                      {place.address ? (
                        <p className="mt-1 text-[12px] leading-5 text-muted">{String(place.address)}</p>
                      ) : null}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir no Google Maps"
                        className="map-external-link"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-surface">
              <MapPin size={20} />
              <p>Nenhum lugar com coordenadas salvo ainda.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
