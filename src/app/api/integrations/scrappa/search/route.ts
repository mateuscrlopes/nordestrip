import { searchScrappaBooking } from "@/lib/integrations/scrappa";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchRequest = {
  tripId?: unknown;
  stopId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  adults?: unknown;
  rooms?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateValue(value: unknown) {
  const text = textValue(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function integerValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível pesquisar hospedagens agora.";
  if (error.message === "scrappa-not-configured") return "Scrappa ainda não está configurada no servidor.";
  if (error.message === "scrappa-auth-failed") return "A chave da Scrappa não foi aceita.";
  if (error.message === "scrappa-rate-limited") return "A Scrappa limitou temporariamente as buscas. Tente novamente em alguns minutos.";
  return "Não foi possível consultar a Booking agora.";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  let body: SearchRequest;
  try {
    body = await request.json() as SearchRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = textValue(body.tripId);
  const stopId = textValue(body.stopId);
  const checkIn = dateValue(body.checkIn);
  const checkOut = dateValue(body.checkOut);
  const adults = integerValue(body.adults, 2, 1, 30);
  const rooms = integerValue(body.rooms, 1, 1, 30);

  if (!tripId || !stopId || !checkIn || !checkOut) {
    return Response.json({ error: "Cidade e datas são obrigatórias." }, { status: 400 });
  }
  if (checkOut <= checkIn) {
    return Response.json({ error: "O check-out precisa ser posterior ao check-in." }, { status: 400 });
  }

  const [membership, stop] = await Promise.all([
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(),
    supabase.from("stops").select("id,name,state_code").eq("id", stopId).eq("trip_id", tripId).is("archived_at", null).maybeSingle(),
  ]);

  if (membership.error || stop.error) {
    return Response.json({ error: "Não foi possível validar a viagem." }, { status: 500 });
  }
  if (!membership.data || !stop.data) {
    return Response.json({ error: "Acesso negado para esta cidade." }, { status: 403 });
  }

  const destination = [stop.data.name, stop.data.state_code, "Brasil"].filter(Boolean).join(", ");

  try {
    const results = await searchScrappaBooking({
      destination,
      checkIn,
      checkOut,
      adults,
      rooms,
    });

    const now = new Date().toISOString();
    const ownConnection = await supabase
      .from("integration_connections")
      .select("id,metadata")
      .eq("trip_id", tripId)
      .eq("owner_user_id", user.id)
      .eq("provider", "scrappa")
      .eq("purpose", "accommodation_search")
      .is("archived_at", null)
      .maybeSingle();

    if (!ownConnection.error) {
      const metadata =
        ownConnection.data?.metadata &&
        typeof ownConnection.data.metadata === "object" &&
        !Array.isArray(ownConnection.data.metadata)
          ? ownConnection.data.metadata as Record<string, unknown>
          : {};

      await supabase.from("integration_connections").upsert(
        {
          trip_id: tripId,
          owner_user_id: user.id,
          provider: "scrappa",
          purpose: "accommodation_search",
          status: "connected",
          last_success_at: now,
          last_sync_at: now,
          last_error_at: null,
          last_error_message: null,
          metadata: {
            ...metadata,
            last_search: {
              stop_id: stopId,
              check_in: checkIn,
              check_out: checkOut,
              result_count: results.length,
            },
          },
          updated_at: now,
          archived_at: null,
        },
        { onConflict: "trip_id,owner_user_id,provider,purpose" }
      );
    }

    return Response.json({ results });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof Error && error.message === "scrappa-not-configured" ? 503 : 502;

    const ownConnection = await supabase
      .from("integration_connections")
      .select("id")
      .eq("trip_id", tripId)
      .eq("owner_user_id", user.id)
      .eq("provider", "scrappa")
      .eq("purpose", "accommodation_search")
      .is("archived_at", null)
      .maybeSingle();

    if (ownConnection.data?.id) {
      const now = new Date().toISOString();
      await supabase.from("integration_connections").update({
        status: status === 503 ? "not_configured" : "needs_attention",
        last_error_at: now,
        last_error_message: message,
        updated_at: now,
      }).eq("id", ownConnection.data.id);
    }

    return Response.json({ error: message }, { status });
  }
}
