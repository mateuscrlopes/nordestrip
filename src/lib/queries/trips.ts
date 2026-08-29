import { createClient } from "@/lib/supabase/server";
import type { FinanceSummary, ItineraryItem, PendingItem, Stop, Transport, Trip } from "@/types/trip";

function checked<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as T;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Não foi possível carregar a sessão: ${error.message}`);
  return data.user;
}

export async function getUserTrips(): Promise<Trip[]> {
  const supabase = await createClient();
  const memberships = checked(await supabase.from("trip_members").select("trip_id"), "Não foi possível carregar as viagens");
  const ids = memberships.map((item) => item.trip_id);
  if (!ids.length) return [];
  return checked(await supabase.from("trips").select("*").in("id", ids).order("start_date"), "Não foi possível carregar as viagens") as Trip[];
}

export async function getTripStops(tripId: string): Promise<Stop[]> {
  const supabase = await createClient();
  return checked(await supabase.from("stops").select("*").eq("trip_id", tripId).order("sequence"), "Não foi possível carregar as cidades") as Stop[];
}
export async function getTripItinerary(tripId: string): Promise<ItineraryItem[]> {
  const supabase = await createClient();
  return checked(await supabase.from("v_itinerary_day").select("*").eq("trip_id", tripId).order("activity_date"), "Não foi possível carregar o roteiro") as ItineraryItem[];
}
export async function getTripPendingItems(tripId: string): Promise<PendingItem[]> {
  const supabase = await createClient();
  return checked(await supabase.from("pending_items").select("*").eq("trip_id", tripId).in("status", ["pending", "checking"]).order("due_at", { nullsFirst: false }), "Não foi possível carregar as pendências") as PendingItem[];
}
export async function getTripTransports(tripId: string): Promise<Transport[]> {
  const supabase = await createClient();
  return checked(await supabase.from("transport_segments").select("*").eq("trip_id", tripId).order("departure_date", { nullsFirst: false }).order("departure_at", { nullsFirst: false }), "Não foi possível carregar os transportes") as Transport[];
}
export async function getTripFinanceSummary(tripId: string): Promise<FinanceSummary | null> {
  const supabase = await createClient();
  return checked(await supabase.from("v_trip_finance_summary").select("*").eq("trip_id", tripId).maybeSingle(), "Não foi possível carregar o resumo financeiro") as FinanceSummary | null;
}
export async function getStopDetails(stopId: string) {
  const supabase = await createClient();
  const stop = checked(await supabase.from("stops").select("*").eq("id", stopId).single(), "Não foi possível carregar a cidade") as Stop;
  const [accommodation, luggage, activities, pending, inbound, outbound] = await Promise.all([
    supabase.from("accommodations").select("*, place:places(*)").eq("stop_id", stopId).maybeSingle(),
    supabase.from("luggage_plans").select("*").eq("stop_id", stopId),
    supabase.from("itinerary_items").select("*").eq("stop_id", stopId).order("start_time"),
    supabase.from("pending_items").select("*").eq("stop_id", stopId).in("status", ["pending", "checking"]).order("due_at", { nullsFirst: false }),
    supabase.from("transport_segments").select("*").eq("destination_stop_id", stopId).order("arrival_at").limit(1).maybeSingle(),
    supabase.from("transport_segments").select("*").eq("origin_stop_id", stopId).order("departure_at").limit(1).maybeSingle(),
  ]);
  for (const [label, result] of [["hospedagem", accommodation], ["bagagem", luggage], ["atividades", activities], ["pendências", pending], ["chegada", inbound], ["saída", outbound]] as const) {
    if (result.error) throw new Error(`Não foi possível carregar ${label}: ${result.error.message}`);
  }
  const luggagePlans = luggage.data ?? [];
  return { stop, accommodation: accommodation.data, arrivalLuggage: luggagePlans.find((plan) => plan.phase === "arrival") ?? null, departureLuggage: luggagePlans.find((plan) => plan.phase === "departure") ?? null, activities: activities.data ?? [], pending: pending.data ?? [], inbound: inbound.data, outbound: outbound.data };
}

export async function getTripPlaces(tripId: string) {
  const supabase = await createClient();
  return checked(await supabase.from("places").select("*").eq("trip_id", tripId).not("latitude", "is", null).not("longitude", "is", null), "Não foi possível carregar os lugares") as Record<string, unknown>[];
}

export async function getTripMoreData(tripId: string) {
  const supabase = await createClient();
  const [reservations, documents, members, integrations] = await Promise.all([
    supabase.from("reservations").select("*").eq("trip_id", tripId),
    supabase.from("documents").select("*").eq("trip_id", tripId),
    supabase.from("trip_members").select("*").eq("trip_id", tripId),
    supabase.from("integration_connections").select("*").eq("trip_id", tripId),
  ]);
  for (const [label, result] of [["reservas", reservations], ["documentos", documents], ["participantes", members], ["integrações", integrations]] as const) {
    if (result.error) throw new Error(`Não foi possível carregar ${label}: ${result.error.message}`);
  }
  return { reservations: reservations.data ?? [], documents: documents.data ?? [], members: members.data ?? [], integrations: integrations.data ?? [] };
}
