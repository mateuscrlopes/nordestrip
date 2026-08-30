import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function tripIdFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("tripId");
  return value?.trim() || null;
}

export async function GET(request: Request) {
  const tripId = tripIdFrom(request);
  if (!tripId) {
    return Response.json({ error: "Viagem não informada." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership.error) {
    return Response.json({ error: "Não foi possível validar o acesso à viagem." }, { status: 500 });
  }
  if (!membership.data) {
    return Response.json({ error: "Acesso negado para esta viagem." }, { status: 403 });
  }

  const [trip, stops, itinerary, transports, accommodations, luggage, documents, pending] = await Promise.all([
    supabase
      .from("trips")
      .select("id,name,start_date,end_date,status,currency,timezone")
      .eq("id", tripId)
      .single(),
    supabase
      .from("stops")
      .select("id,name,state_code,sequence,sort_order,start_date,end_date,status")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .order("sort_order")
      .order("sequence"),
    supabase
      .from("itinerary_items")
      .select("id,stop_id,place_id,title,activity_date,period,start_time,end_time,schedule_type,is_anchor,priority,status,notes")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("activity_date")
      .order("sequence"),
    supabase
      .from("transport_segments")
      .select("id,origin_stop_id,destination_stop_id,mode,status,departure_at,arrival_at,departure_date,arrival_date,origin_label,destination_label,operator,service_class,booking_reference,origin_terminal_name,origin_terminal_address,destination_terminal_name,destination_terminal_address,has_checked_baggage,baggage_notes,notes,source_url")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("departure_date", { nullsFirst: false })
      .order("departure_at", { nullsFirst: false }),
    supabase
      .from("accommodations")
      .select("id,stop_id,place_id,name,status,check_in_date,check_out_date,check_in_from,check_out_until,source_url,notes")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("created_at"),
    supabase
      .from("luggage_plans")
      .select("id,stop_id,phase,strategy,status,available_from,available_until,notes")
      .eq("trip_id", tripId)
      .is("archived_at", null),
    supabase
      .from("documents")
      .select("id,title,document_type,external_url,notes")
      .eq("trip_id", tripId)
      .eq("is_essential", true)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("pending_items")
      .select("id,stop_id,title,description,due_at,priority,status")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .in("status", ["pending", "checking"])
      .order("due_at", { nullsFirst: false }),
  ]);

  const results = [
    ["viagem", trip],
    ["cidades", stops],
    ["roteiro", itinerary],
    ["transportes", transports],
    ["hospedagens", accommodations],
    ["bagagem", luggage],
    ["documentos", documents],
    ["pendências", pending],
  ] as const;

  for (const [label, result] of results) {
    if (result.error) {
      return Response.json(
        { error: `Não foi possível preparar o pacote offline de ${label}.` },
        { status: 500 }
      );
    }
  }

  const placeIds = Array.from(new Set([
    ...(itinerary.data ?? []).map((item) => item.place_id),
    ...(accommodations.data ?? []).map((item) => item.place_id),
  ].filter((value): value is string => typeof value === "string" && Boolean(value))));

  const places = placeIds.length
    ? await supabase
        .from("places")
        .select("id,name,address,latitude,longitude,source_url")
        .in("id", placeIds)
        .eq("trip_id", tripId)
        .is("archived_at", null)
    : { data: [], error: null };

  if (places.error) {
    return Response.json(
      { error: "Não foi possível preparar as localizações do pacote offline." },
      { status: 500 }
    );
  }

  return Response.json(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      trip: trip.data,
      stops: stops.data ?? [],
      itinerary: itinerary.data ?? [],
      transports: transports.data ?? [],
      accommodations: accommodations.data ?? [],
      luggage: luggage.data ?? [],
      documents: documents.data ?? [],
      pending: pending.data ?? [],
      places: places.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
