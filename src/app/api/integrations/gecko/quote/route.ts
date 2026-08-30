import { parseClientBusResult } from "@/lib/integrations/gecko";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QuoteRequest = {
  tripId?: unknown;
  transportId?: unknown;
  result?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  let body: QuoteRequest;
  try {
    body = await request.json() as QuoteRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = textValue(body.tripId);
  const transportId = textValue(body.transportId);
  const result = parseClientBusResult(body.result);

  if (!tripId || !transportId || !result) {
    return Response.json({ error: "Cotação incompleta." }, { status: 400 });
  }

  const [membership, segment] = await Promise.all([
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(),
    supabase.from("transport_segments")
      .select("id,origin_stop_id,destination_stop_id,mode")
      .eq("id", transportId)
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .maybeSingle(),
  ]);

  if (membership.error || segment.error) {
    return Response.json({ error: "Não foi possível validar o trecho." }, { status: 500 });
  }
  if (!membership.data || !segment.data) {
    return Response.json({ error: "Acesso negado para este trecho." }, { status: 403 });
  }
  if (segment.data.mode !== "bus" || !segment.data.origin_stop_id || !segment.data.destination_stop_id) {
    return Response.json({ error: "Este trecho não aceita cotação rodoviária." }, { status: 400 });
  }

  const payload = {
    trip_id: tripId,
    origin_stop_id: segment.data.origin_stop_id,
    destination_stop_id: segment.data.destination_stop_id,
    provider: "geckoapi_clickbus",
    external_id: result.externalId,
    mode: "bus",
    departure_at: result.departureAt,
    arrival_at: result.arrivalAt,
    duration_minutes: result.durationMinutes,
    operator: result.operator,
    service_class: result.serviceClass,
    origin_terminal_name: result.originTerminalName,
    origin_terminal_address: result.originTerminalAddress,
    destination_terminal_name: result.destinationTerminalName,
    destination_terminal_address: result.destinationTerminalAddress,
    total_amount: result.pricePerPassenger,
    currency: result.currency,
    seats_available: result.seatsAvailable,
    features: {
      ...result.features,
      duration_text: result.durationText,
      original_price_per_passenger: result.originalPricePerPassenger,
      pricing_basis: "per_passenger",
    },
    source_url: result.sourceUrl,
    raw_payload: result.rawPayload,
    queried_at: new Date().toISOString(),
    archived_at: null,
  };

  const existing = await supabase
    .from("transport_quotes")
    .select("id")
    .eq("trip_id", tripId)
    .eq("origin_stop_id", segment.data.origin_stop_id)
    .eq("destination_stop_id", segment.data.destination_stop_id)
    .eq("provider", "geckoapi_clickbus")
    .eq("external_id", result.externalId)
    .maybeSingle();

  if (existing.error) {
    return Response.json({ error: "Não foi possível verificar cotações salvas." }, { status: 500 });
  }

  const save = existing.data?.id
    ? await supabase.from("transport_quotes").update(payload).eq("id", existing.data.id).select("*").single()
    : await supabase.from("transport_quotes").insert(payload).select("*").single();

  if (save.error || !save.data) {
    return Response.json({ error: "Não foi possível salvar esta opção." }, { status: 500 });
  }

  return Response.json({ quote: save.data });
}
