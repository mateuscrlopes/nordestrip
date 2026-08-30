import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SelectRequest = {
  tripId?: unknown;
  transportId?: unknown;
  quoteId?: unknown;
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

  let body: SelectRequest;
  try {
    body = await request.json() as SelectRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = textValue(body.tripId);
  const transportId = textValue(body.transportId);
  const quoteId = textValue(body.quoteId);

  if (!tripId || !transportId || !quoteId) {
    return Response.json({ error: "Opção de transporte incompleta." }, { status: 400 });
  }

  const [membership, segment, quote] = await Promise.all([
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(),
    supabase.from("transport_segments").select("*").eq("id", transportId).eq("trip_id", tripId).is("archived_at", null).maybeSingle(),
    supabase.from("transport_quotes").select("*").eq("id", quoteId).eq("trip_id", tripId).is("archived_at", null).maybeSingle(),
  ]);

  if (membership.error || segment.error || quote.error) {
    return Response.json({ error: "Não foi possível validar a opção." }, { status: 500 });
  }
  if (!membership.data || !segment.data || !quote.data) {
    return Response.json({ error: "Acesso negado para esta opção." }, { status: 403 });
  }
  if (segment.data.mode !== "bus") {
    return Response.json({ error: "Este trecho não é rodoviário." }, { status: 400 });
  }
  if (
    quote.data.provider !== "geckoapi_clickbus" ||
    quote.data.origin_stop_id !== segment.data.origin_stop_id ||
    quote.data.destination_stop_id !== segment.data.destination_stop_id
  ) {
    return Response.json({ error: "A cotação não pertence a este trecho." }, { status: 400 });
  }

  if (["reserved", "purchased", "confirmed", "completed"].includes(segment.data.status)) {
    return Response.json(
      { error: "Este transporte já está reservado, comprado ou confirmado e não será substituído automaticamente." },
      { status: 409 }
    );
  }

  const departureDate = quote.data.departure_at
    ? String(quote.data.departure_at).slice(0, 10)
    : segment.data.departure_date;
  const arrivalDate = quote.data.arrival_at
    ? String(quote.data.arrival_at).slice(0, 10)
    : segment.data.arrival_date;

  const update = await supabase
    .from("transport_segments")
    .update({
      status: "quoted",
      departure_at: quote.data.departure_at,
      arrival_at: quote.data.arrival_at,
      departure_date: departureDate,
      arrival_date: arrivalDate,
      operator: quote.data.operator,
      service_class: quote.data.service_class,
      origin_terminal_name: quote.data.origin_terminal_name,
      origin_terminal_address: quote.data.origin_terminal_address,
      destination_terminal_name: quote.data.destination_terminal_name,
      destination_terminal_address: quote.data.destination_terminal_address,
      source: "geckoapi_clickbus",
      external_id: quote.data.external_id,
      source_url: quote.data.source_url,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", transportId)
    .eq("trip_id", tripId);

  if (update.error) {
    return Response.json({ error: "Não foi possível escolher esta opção." }, { status: 500 });
  }

  return Response.json({
    transportId,
    farePerPassenger: quote.data.total_amount,
    currency: quote.data.currency,
  });
}
