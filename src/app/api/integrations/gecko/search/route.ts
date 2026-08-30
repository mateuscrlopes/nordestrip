import { searchGeckoClickBus } from "@/lib/integrations/gecko";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchRequest = {
  tripId?: unknown;
  transportId?: unknown;
  page?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Não foi possível pesquisar ônibus agora.";
  if (error.message === "gecko-not-configured") return "GeckoAPI ainda não está configurada no servidor.";
  if (error.message === "gecko-auth-failed") return "A chave da GeckoAPI não foi aceita.";
  if (error.message === "gecko-credits-empty") return "Os créditos da GeckoAPI acabaram.";
  if (error.message === "gecko-rate-limited") return "A GeckoAPI limitou temporariamente as buscas. Tente novamente em alguns minutos.";
  return "Não foi possível consultar a ClickBus agora.";
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
  const transportId = textValue(body.transportId);
  const pageValue = typeof body.page === "number" ? body.page : Number(body.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 20 ? pageValue : 1;

  if (!tripId || !transportId) {
    return Response.json({ error: "Trecho não informado." }, { status: 400 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  const segment = await supabase
    .from("transport_segments")
    .select("id,trip_id,mode,origin_stop_id,destination_stop_id,departure_date,departure_at")
    .eq("id", transportId)
    .eq("trip_id", tripId)
    .is("archived_at", null)
    .maybeSingle();

  if (membership.error || segment.error) {
    return Response.json({ error: "Não foi possível validar o trecho." }, { status: 500 });
  }
  if (!membership.data || !segment.data) {
    return Response.json({ error: "Acesso negado para este trecho." }, { status: 403 });
  }
  if (segment.data.mode !== "bus") {
    return Response.json({ error: "A pesquisa rodoviária só está disponível para trechos de ônibus." }, { status: 400 });
  }
  if (!segment.data.origin_stop_id || !segment.data.destination_stop_id) {
    return Response.json({ error: "O trecho ainda não tem origem e destino estruturados." }, { status: 400 });
  }

  const departureDate =
    segment.data.departure_at
      ? String(segment.data.departure_at).slice(0, 10)
      : textValue(segment.data.departure_date);

  if (!departureDate) {
    return Response.json({ error: "Defina a data do trecho antes de pesquisar passagens." }, { status: 400 });
  }

  const stops = await supabase
    .from("stops")
    .select("id,name,state_code")
    .in("id", [segment.data.origin_stop_id, segment.data.destination_stop_id])
    .eq("trip_id", tripId)
    .is("archived_at", null);

  if (stops.error) {
    return Response.json({ error: "Não foi possível carregar origem e destino." }, { status: 500 });
  }

  const origin = (stops.data || []).find((stop) => stop.id === segment.data.origin_stop_id);
  const destination = (stops.data || []).find((stop) => stop.id === segment.data.destination_stop_id);

  if (!origin?.name || !origin.state_code || !destination?.name || !destination.state_code) {
    return Response.json({ error: "Origem ou destino não possui cidade/UF suficiente para a busca." }, { status: 400 });
  }

  try {
    const results = await searchGeckoClickBus({
      originCity: origin.name,
      originState: origin.state_code,
      destinationCity: destination.name,
      destinationState: destination.state_code,
      departureDate,
      page,
    });

    const now = new Date().toISOString();
    const ownConnection = await supabase
      .from("integration_connections")
      .select("id,metadata")
      .eq("trip_id", tripId)
      .eq("owner_user_id", user.id)
      .eq("provider", "geckoapi")
      .eq("purpose", "bus_search")
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
          provider: "geckoapi",
          purpose: "bus_search",
          status: "connected",
          last_success_at: now,
          last_sync_at: now,
          last_error_at: null,
          last_error_message: null,
          metadata: {
            ...metadata,
            last_search: {
              transport_id: transportId,
              origin_stop_id: segment.data.origin_stop_id,
              destination_stop_id: segment.data.destination_stop_id,
              departure_date: departureDate,
              result_count: results.length,
            },
          },
          updated_at: now,
          archived_at: null,
        },
        { onConflict: "trip_id,owner_user_id,provider,purpose" }
      );
    }

    return Response.json({
      route: {
        origin: origin.name,
        destination: destination.name,
        departureDate,
      },
      results,
    });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof Error && error.message === "gecko-not-configured" ? 503 : 502;

    const ownConnection = await supabase
      .from("integration_connections")
      .select("id")
      .eq("trip_id", tripId)
      .eq("owner_user_id", user.id)
      .eq("provider", "geckoapi")
      .eq("purpose", "bus_search")
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
