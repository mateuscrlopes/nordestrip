import { PageHeader } from "@/components/layout/page-header";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import {
  getTripCityCovers,
  getTripItinerary,
  getTripLuggagePlans,
  getTripPendingItems,
  getTripStops,
  getTripTransports,
} from "@/lib/queries/trips";

export default async function ItineraryPage() {
  const { trip } = await getCurrentTrip();

  if (!trip) {
    return <PageHeader title="Roteiro" description="Nenhuma viagem selecionada." />;
  }

  const [stops, days, pending, transports, covers, luggagePlans] = await Promise.all([
    getTripStops(trip.id),
    getTripItinerary(trip.id),
    getTripPendingItems(trip.id),
    getTripTransports(trip.id),
    getTripCityCovers(trip.id),
    getTripLuggagePlans(trip.id),
  ]);

  return (
    <>
      <PageHeader
        title="Roteiro"
        description="Cidades, dias e deslocamentos da viagem."
      />
      <ItineraryView
        tripId={trip.id}
        stops={stops}
        days={days}
        pending={pending}
        transports={transports}
        covers={covers}
        luggagePlans={luggagePlans}
      />
    </>
  );
}
