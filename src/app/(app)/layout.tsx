import "./mobile-polish.css";
import { OfflineSync } from "@/components/offline/offline-sync";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { GlobalAdd } from "@/components/navigation/global-add";
import { ContextBackButton } from "@/components/navigation/context-back-button";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getCurrentUser, getTripStops } from "@/lib/queries/trips";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, { trip }] = await Promise.all([
    getCurrentUser(),
    getCurrentTrip(),
  ]);
  if (!user) redirect("/login");

  const stops = trip ? await getTripStops(trip.id) : [];

  return (
    <div className="mx-auto min-h-screen w-full max-w-[720px] px-5 pb-44 pt-5 md:px-8 md:pt-8">
      <OfflineSync tripId={trip?.id ?? null} />
      <ContextBackButton />
      {children}
      <BottomNav
        action={
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
        }
      />
    </div>
  );
}
