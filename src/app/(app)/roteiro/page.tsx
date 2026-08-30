import { PageHeader } from "@/components/layout/page-header";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { RouteGeographyControl } from "@/components/itinerary/route-geography-control";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripItineraryBundle } from "@/lib/queries/trips";

export default async function ItineraryPage() {
  const { trip } = await getCurrentTrip();

  if (!trip) {
    return <PageHeader title="Roteiro" description="Nenhuma viagem selecionada." />;
  }

  const {
    stops,
    days,
    pending,
    transports,
    covers,
    luggagePlans,
    places,
    preferences,
  } = await getTripItineraryBundle(trip.id);

  return (
    <>
      <PageHeader
        title="Roteiro"
        description="Cidades, dias e deslocamentos da viagem."
      />
      <RouteGeographyControl tripId={trip.id} />
      <ItineraryView
        tripId={trip.id}
        stops={stops}
        days={days}
        pending={pending}
        transports={transports}
        covers={covers}
        luggagePlans={luggagePlans}
        places={places}
        preferences={preferences}
      />
    </>
  );
}
