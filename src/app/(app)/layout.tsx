import { BottomNav } from "@/components/navigation/bottom-nav";
import { GlobalAdd } from "@/components/navigation/global-add";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getCurrentUser, getTripStops } from "@/lib/queries/trips";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { trip } = await getCurrentTrip();
  const stops = trip ? await getTripStops(trip.id) : [];

  return (
    <div className="mx-auto min-h-screen w-full max-w-[720px] px-5 pb-44 pt-5 md:px-8 md:pt-8">
      {children}
      <GlobalAdd
        tripId={trip?.id ?? null}
        userId={user.id}
        stops={stops.map((stop) => ({
          id: stop.id,
          name: stop.city || stop.name || "Cidade",
          startDate: stop.start_date,
          endDate: stop.end_date,
        }))}
      />
      <BottomNav />
    </div>
  );
}
