import { PageHeader } from "@/components/layout/page-header";
import { PlacesExplorer } from "@/components/places/places-explorer";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripItinerary, getTripPlaceCatalog, getTripStops, getTripTransports } from "@/lib/queries/trips";

export default async function PlacesPage() {
  const { trip } = await getCurrentTrip();

  if (!trip) {
    return <PageHeader title="Locais" description="Nenhuma viagem selecionada." />;
  }

  const [stops, places, itinerary, transports] = await Promise.all([
    getTripStops(trip.id),
    getTripPlaceCatalog(trip.id),
    getTripItinerary(trip.id),
    getTripTransports(trip.id),
  ]);

  return (
    <>
      <PageHeader
        title="Locais"
        description="Opções salvas por cidade para comparar e levar ao roteiro."
      />
      <PlacesExplorer
        tripId={trip.id}
        stops={stops}
        places={places}
        itinerary={itinerary}
        transports={transports}
      />
    </>
  );
}
