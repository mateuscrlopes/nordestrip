import { cache } from "react";
import { getUserTrips } from "./trips";
export const getCurrentTrip = cache(async () => { const trips = await getUserTrips(); return { trip: trips.length === 1 ? trips[0] : trips[0] ?? null, trips }; });
