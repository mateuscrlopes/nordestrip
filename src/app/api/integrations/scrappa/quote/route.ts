import { parseClientAccommodationResult } from "@/lib/integrations/scrappa";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QuoteRequest = {
  tripId?: unknown;
  stopId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  result?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateValue(value: unknown) {
  const text = textValue(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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
  const stopId = textValue(body.stopId);
  const checkIn = dateValue(body.checkIn);
  const checkOut = dateValue(body.checkOut);
  const result = parseClientAccommodationResult(body.result);

  if (!tripId || !stopId || !checkIn || !checkOut || !result) {
    return Response.json({ error: "Cotação incompleta." }, { status: 400 });
  }
  if (checkOut <= checkIn) {
    return Response.json({ error: "O check-out precisa ser posterior ao check-in." }, { status: 400 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  const stop = await supabase
    .from("stops")
    .select("id")
    .eq("id", stopId)
    .eq("trip_id", tripId)
    .is("archived_at", null)
    .maybeSingle();

  if (membership.error || stop.error) {
    return Response.json({ error: "Não foi possível validar a viagem." }, { status: 500 });
  }
  if (!membership.data || !stop.data) {
    return Response.json({ error: "Acesso negado para esta cidade." }, { status: 403 });
  }

  const externalId =
    result.externalId ||
    result.sourceUrl ||
    `${result.name.toLowerCase()}|${checkIn}|${checkOut}`;
  const now = new Date().toISOString();

  const payload = {
    trip_id: tripId,
    stop_id: stopId,
    provider: "scrappa_booking",
    external_id: externalId,
    name: result.name,
    source_url: result.sourceUrl,
    check_in_date: checkIn,
    check_out_date: checkOut,
    total_amount: result.totalAmount,
    currency: result.currency || "BRL",
    review_score: result.reviewScore,
    review_count: result.reviewCount,
    address: result.address,
    latitude: result.latitude,
    longitude: result.longitude,
    raw_payload: {
      provider_result: result.rawPayload,
      price_label: result.priceLabel,
      image_url: result.imageUrl,
    },
    queried_at: now,
    archived_at: null,
  };

  const existing = await supabase
    .from("accommodation_quotes")
    .select("id")
    .eq("trip_id", tripId)
    .eq("stop_id", stopId)
    .eq("provider", "scrappa_booking")
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing.error) {
    return Response.json({ error: "Não foi possível verificar opções salvas." }, { status: 500 });
  }

  const save = existing.data?.id
    ? await supabase.from("accommodation_quotes").update(payload).eq("id", existing.data.id).select("*").single()
    : await supabase.from("accommodation_quotes").insert(payload).select("*").single();

  if (save.error || !save.data) {
    return Response.json({ error: "Não foi possível salvar esta opção." }, { status: 500 });
  }

  return Response.json({ quote: save.data });
}
