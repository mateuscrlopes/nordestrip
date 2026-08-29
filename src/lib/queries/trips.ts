import { createClient } from "@/lib/supabase/server";
import type { ChangeLogEntry, CityCover, Expense, FinanceSummary, ItineraryItem, LuggagePlanSummary, PendingItem, Stop, Transport, Trip, TripFinanceSettings, TripPreferences } from "@/types/trip";

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
  return checked(await supabase.from("stops").select("*").eq("trip_id", tripId).is("archived_at", null).order("sort_order").order("sequence"), "Não foi possível carregar as cidades") as Stop[];
}

export async function getTripItinerary(tripId: string): Promise<ItineraryItem[]> {
  const supabase = await createClient();
  return checked(await supabase.from("v_itinerary_day").select("*").eq("trip_id", tripId).order("activity_date"), "Não foi possível carregar o roteiro") as ItineraryItem[];
}

export async function getTripPendingItems(tripId: string): Promise<PendingItem[]> {
  const supabase = await createClient();
  return checked(await supabase.from("pending_items").select("*").eq("trip_id", tripId).is("archived_at", null).in("status", ["pending", "checking"]).order("due_at", { nullsFirst: false }), "Não foi possível carregar as pendências") as PendingItem[];
}

export async function getTripTransports(tripId: string): Promise<Transport[]> {
  const supabase = await createClient();
  return checked(await supabase.from("transport_segments").select("*").eq("trip_id", tripId).is("archived_at", null).order("departure_date", { nullsFirst: false }).order("departure_at", { nullsFirst: false }), "Não foi possível carregar os transportes") as Transport[];
}

export async function getTripFinanceSummary(tripId: string): Promise<FinanceSummary | null> {
  const supabase = await createClient();
  return checked(await supabase.from("v_trip_finance_summary").select("*").eq("trip_id", tripId).maybeSingle(), "Não foi possível carregar o resumo financeiro") as FinanceSummary | null;
}

export async function getTripExpenses(tripId: string, limit = 8): Promise<Expense[]> {
  const supabase = await createClient();
  return checked(
    await supabase.from("expenses").select("*").eq("trip_id", tripId).is("archived_at", null).eq("is_transfer", false).order("occurred_at", { ascending: false }).limit(limit),
    "Não foi possível carregar os gastos"
  ) as Expense[];
}

export async function getTripCityCovers(tripId: string): Promise<CityCover[]> {
  const supabase = await createClient();
  return checked(
    await supabase.from("v_city_covers").select("*").eq("trip_id", tripId).eq("is_active", true).order("sort_order"),
    "Não foi possível carregar as capas das cidades"
  ) as CityCover[];
}

export async function getStopDetails(stopId: string) {
  const supabase = await createClient();
  const stop = checked(await supabase.from("stops").select("*").eq("id", stopId).single(), "Não foi possível carregar a cidade") as Stop;
  const [accommodation, luggage, activities, pending, inbound, outbound] = await Promise.all([
    supabase.from("accommodations").select("*, place:places(*)").eq("stop_id", stopId).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("luggage_plans").select("*").eq("stop_id", stopId).is("archived_at", null),
    supabase.from("itinerary_items").select("*").eq("stop_id", stopId).is("archived_at", null).order("start_time"),
    supabase.from("pending_items").select("*").eq("stop_id", stopId).is("archived_at", null).in("status", ["pending", "checking"]).order("due_at", { nullsFirst: false }),
    supabase.from("transport_segments").select("*").eq("destination_stop_id", stopId).is("archived_at", null).or("status.is.null,status.neq.cancelled").order("arrival_at").limit(1).maybeSingle(),
    supabase.from("transport_segments").select("*").eq("origin_stop_id", stopId).is("archived_at", null).or("status.is.null,status.neq.cancelled").order("departure_at").limit(1).maybeSingle(),
  ]);
  for (const [label, result] of [["hospedagem", accommodation], ["bagagem", luggage], ["atividades", activities], ["pendências", pending], ["chegada", inbound], ["saída", outbound]] as const) {
    if (result.error) throw new Error(`Não foi possível carregar ${label}: ${result.error.message}`);
  }
  const luggagePlans = luggage.data ?? [];
  const accommodations = accommodation.data ?? [];
  const selectedAccommodation =
    accommodations.find((item) => ["confirmed", "reserved", "selected"].includes(item.status))
    ?? accommodations[0]
    ?? null;

  return {
    stop,
    accommodation: selectedAccommodation,
    arrivalLuggage: luggagePlans.find((plan) => plan.phase === "arrival") ?? null,
    departureLuggage: luggagePlans.find((plan) => plan.phase === "departure") ?? null,
    activities: activities.data ?? [],
    pending: pending.data ?? [],
    inbound: inbound.data,
    outbound: outbound.data,
  };
}

export async function getTripPlaces(tripId: string) {
  const supabase = await createClient();
  return checked(await supabase.from("places").select("*").eq("trip_id", tripId).is("archived_at", null).order("created_at", { ascending: false }), "Não foi possível carregar os lugares") as Record<string, unknown>[];
}

export async function getTripMoreData(tripId: string) {
  const supabase = await createClient();
  const [reservations, documents, members, integrations] = await Promise.all([
    supabase.from("reservations").select("*").eq("trip_id", tripId).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("documents").select("*").eq("trip_id", tripId).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("trip_members").select("*").eq("trip_id", tripId),
    supabase.from("integration_connections").select("*").eq("trip_id", tripId),
  ]);
  for (const [label, result] of [["reservas", reservations], ["documentos", documents], ["participantes", members], ["integrações", integrations]] as const) {
    if (result.error) throw new Error(`Não foi possível carregar ${label}: ${result.error.message}`);
  }
  return { reservations: reservations.data ?? [], documents: documents.data ?? [], members: members.data ?? [], integrations: integrations.data ?? [] };
}


export async function getTripArchivedRecords(tripId: string) {
  const supabase = await createClient();
  const [pending, reservations, itinerary, accommodations, transports, expenses, documents, places, stops] = await Promise.all([
    supabase.from("pending_items").select("id,title,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("reservations").select("id,title,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("itinerary_items").select("id,title,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("accommodations").select("id,name,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("transport_segments").select("id,origin_label,destination_label,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("expenses").select("id,title,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("documents").select("id,title,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("places").select("id,name,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
    supabase.from("stops").select("id,name,archived_at").eq("trip_id", tripId).not("archived_at", "is", null),
  ]);

  for (const [label, result] of [
    ["pendências", pending],
    ["reservas", reservations],
    ["roteiro", itinerary],
    ["hospedagens", accommodations],
    ["transportes", transports],
    ["gastos", expenses],
    ["documentos", documents],
    ["lugares", places],
    ["cidades", stops],
  ] as const) {
    if (result.error) throw new Error(`Não foi possível carregar o histórico de ${label}: ${result.error.message}`);
  }

  const rows = [
    ...(pending.data ?? []).map((item) => ({ id: item.id, table: "pending_items" as const, type: "Pendência", label: item.title, archived_at: item.archived_at })),
    ...(reservations.data ?? []).map((item) => ({ id: item.id, table: "reservations" as const, type: "Reserva", label: item.title, archived_at: item.archived_at })),
    ...(itinerary.data ?? []).map((item) => ({ id: item.id, table: "itinerary_items" as const, type: "Roteiro", label: item.title, archived_at: item.archived_at })),
    ...(accommodations.data ?? []).map((item) => ({ id: item.id, table: "accommodations" as const, type: "Hospedagem", label: item.name, archived_at: item.archived_at })),
    ...(transports.data ?? []).map((item) => ({
      id: item.id,
      table: "transport_segments" as const,
      type: "Transporte",
      label: [item.origin_label, item.destination_label].filter(Boolean).join(" → ") || "Deslocamento",
      archived_at: item.archived_at,
    })),
    ...(expenses.data ?? []).map((item) => ({ id: item.id, table: "expenses" as const, type: "Gasto", label: item.title, archived_at: item.archived_at })),
    ...(documents.data ?? []).map((item) => ({ id: item.id, table: "documents" as const, type: "Documento", label: item.title, archived_at: item.archived_at })),
    ...(places.data ?? []).map((item) => ({ id: item.id, table: "places" as const, type: "Lugar", label: item.name, archived_at: item.archived_at })),
    ...(stops.data ?? []).map((item) => ({ id: item.id, table: "stops" as const, type: "Cidade", label: item.name, archived_at: item.archived_at })),
  ];

  return rows.sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}


export async function getTripPreferences(tripId: string): Promise<TripPreferences | null> {
  const supabase = await createClient();
  return checked(
    await supabase.from("trip_preferences").select("*").eq("trip_id", tripId).maybeSingle(),
    "Não foi possível carregar as preferências da viagem"
  ) as TripPreferences | null;
}

export async function getTripFinanceSettings(tripId: string): Promise<TripFinanceSettings | null> {
  const supabase = await createClient();
  return checked(
    await supabase.from("trip_finance_settings").select("*").eq("trip_id", tripId).maybeSingle(),
    "Não foi possível carregar as configurações financeiras"
  ) as TripFinanceSettings | null;
}


export async function getTripChangeLog(tripId: string, limit = 30): Promise<ChangeLogEntry[]> {
  const supabase = await createClient();
  return checked(
    await supabase
      .from("change_log")
      .select("id,trip_id,user_id,entity_type,entity_id,action,summary,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "Não foi possível carregar o histórico de alterações"
  ) as ChangeLogEntry[];
}


export async function getTripParticipants(tripId: string, currentUserId: string) {
  const supabase = await createClient();

  const [membership, members] = await Promise.all([
    supabase
      .from("trip_members")
      .select("id,user_id,role,default_split_percentage,created_at")
      .eq("trip_id", tripId)
      .eq("user_id", currentUserId)
      .maybeSingle(),
    supabase
      .from("trip_members")
      .select("id,user_id,role,default_split_percentage,created_at")
      .eq("trip_id", tripId)
      .order("created_at"),
  ]);

  if (membership.error) throw new Error(`Não foi possível carregar seu acesso: ${membership.error.message}`);
  if (members.error) throw new Error(`Não foi possível carregar os participantes: ${members.error.message}`);

  const userIds = (members.data ?? []).map((member) => member.user_id);
  const profiles = userIds.length
    ? await supabase.from("profiles").select("id,name,avatar_url").in("id", userIds)
    : { data: [], error: null };

  if (profiles.error) throw new Error(`Não foi possível carregar os perfis: ${profiles.error.message}`);

  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  let invites: Record<string, unknown>[] = [];
  if (membership.data?.role === "owner") {
    const inviteResult = await supabase
      .from("trip_invites")
      .select("id,email,role,status,expires_at,created_at")
      .eq("trip_id", tripId)
      .in("status", ["pending", "expired"])
      .order("created_at", { ascending: false });

    if (inviteResult.error) throw new Error(`Não foi possível carregar os convites: ${inviteResult.error.message}`);
    invites = inviteResult.data ?? [];
  }

  return {
    currentRole: membership.data?.role ?? "member",
    members: (members.data ?? []).map((member) => {
      const profile = profileById.get(member.user_id);
      return {
        id: member.id,
        userId: member.user_id,
        name: profile?.name || "Participante",
        avatarUrl: profile?.avatar_url || null,
        role: member.role,
        defaultSplitPercentage: member.default_split_percentage == null
          ? null
          : Number(member.default_split_percentage),
      };
    }),
    invites,
  };
}


export async function getTripLuggagePlans(tripId: string): Promise<LuggagePlanSummary[]> {
  const supabase = await createClient();
  return checked(
    await supabase
      .from("luggage_plans")
      .select("id,trip_id,stop_id,phase,strategy,status,available_from,available_until,confirmed_at")
      .eq("trip_id", tripId)
      .is("archived_at", null),
    "Não foi possível carregar os planos de bagagem"
  ) as LuggagePlanSummary[];
}


export async function getTripManualFund(tripId: string) {
  const supabase = await createClient();
  const links = await supabase
    .from("trip_financial_accounts")
    .select("financial_account_id,include_balance_in_available")
    .eq("trip_id", tripId)
    .eq("purpose", "trip_fund")
    .is("archived_at", null);

  if (links.error) throw new Error(`Não foi possível carregar o fundo manual: ${links.error.message}`);
  if (!links.data?.length) return null;

  const accountIds = links.data.map((link) => link.financial_account_id);
  const accounts = await supabase
    .from("financial_accounts")
    .select("id,provider,display_name,current_balance,last_synced_at")
    .in("id", accountIds)
    .eq("provider", "manual")
    .is("archived_at", null);

  if (accounts.error) throw new Error(`Não foi possível carregar o saldo manual: ${accounts.error.message}`);

  const account = accounts.data?.[0];
  if (!account) return null;
  const link = links.data.find((item) => item.financial_account_id === account.id);

  return {
    accountId: account.id,
    balance: account.current_balance == null ? 0 : Number(account.current_balance),
    enabled: Boolean(link?.include_balance_in_available),
    lastSyncedAt: account.last_synced_at ?? null,
  };
}
