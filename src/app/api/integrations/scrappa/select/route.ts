import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SelectRequest = {
  tripId?: unknown;
  stopId?: unknown;
  quoteId?: unknown;
  currentAccommodationId?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function placeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  const stopId = textValue(body.stopId);
  const quoteId = textValue(body.quoteId);
  const currentAccommodationId = textValue(body.currentAccommodationId);

  if (!tripId || !stopId || !quoteId) {
    return Response.json({ error: "Opção de hospedagem incompleta." }, { status: 400 });
  }

  const [membership, quote] = await Promise.all([
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(),
    supabase.from("accommodation_quotes").select("*").eq("id", quoteId).eq("trip_id", tripId).eq("stop_id", stopId).is("archived_at", null).maybeSingle(),
  ]);

  if (membership.error || quote.error) {
    return Response.json({ error: "Não foi possível validar a opção." }, { status: 500 });
  }
  if (!membership.data || !quote.data) {
    return Response.json({ error: "Acesso negado para esta opção." }, { status: 403 });
  }

  const same = await supabase
    .from("accommodations")
    .select("id")
    .eq("trip_id", tripId)
    .eq("stop_id", stopId)
    .eq("source", "scrappa_booking")
    .eq("external_id", quote.data.external_id)
    .is("archived_at", null)
    .maybeSingle();

  if (same.error) {
    return Response.json({ error: "Não foi possível verificar a hospedagem atual." }, { status: 500 });
  }
  if (same.data?.id) {
    return Response.json({ accommodationId: same.data.id, reused: true });
  }

  let accommodationId: string;

  if (currentAccommodationId) {
    const current = await supabase
      .from("accommodations")
      .select("id,status,place_id,accommodation_type,check_in_from,check_out_until,source_url,notes,place:places(address,latitude,longitude)")
      .eq("id", currentAccommodationId)
      .eq("trip_id", tripId)
      .eq("stop_id", stopId)
      .is("archived_at", null)
      .maybeSingle();

    if (current.error) {
      return Response.json({ error: "Não foi possível carregar a hospedagem atual." }, { status: 500 });
    }
    if (!current.data) {
      return Response.json({ error: "Hospedagem atual não encontrada." }, { status: 404 });
    }
    if (["reserved", "confirmed", "completed"].includes(current.data.status)) {
      return Response.json(
        { error: "Já existe uma hospedagem reservada ou confirmada. Ela não será substituída automaticamente." },
        { status: 409 }
      );
    }

    const currentPlace = placeRecord(current.data.place);
    const update = await supabase.rpc("update_accommodation_with_place", {
      p_trip_id: tripId,
      p_accommodation_id: current.data.id,
      p_name: quote.data.name,
      p_accommodation_type: current.data.accommodation_type || "hotel",
      p_status: "selected",
      p_address: quote.data.address || (typeof currentPlace?.address === "string" ? currentPlace.address : null),
      p_check_in_date: quote.data.check_in_date,
      p_check_out_date: quote.data.check_out_date,
      p_check_in_from: current.data.check_in_from,
      p_check_out_until: current.data.check_out_until,
      p_source_url: quote.data.source_url || current.data.source_url,
      p_notes: current.data.notes,
    });

    if (update.error) {
      return Response.json({ error: "Não foi possível escolher esta hospedagem." }, { status: 500 });
    }

    accommodationId = current.data.id;
  } else {
    const create = await supabase.rpc("create_accommodation_with_place", {
      p_trip_id: tripId,
      p_stop_id: stopId,
      p_name: quote.data.name,
      p_accommodation_type: "hotel",
      p_status: "selected",
      p_address: quote.data.address,
      p_check_in_date: quote.data.check_in_date,
      p_check_out_date: quote.data.check_out_date,
      p_check_in_from: null,
      p_check_out_until: null,
      p_source_url: quote.data.source_url,
      p_notes: null,
    });

    if (create.error || typeof create.data !== "string") {
      return Response.json({ error: "Não foi possível escolher esta hospedagem." }, { status: 500 });
    }

    accommodationId = create.data;
  }

  const accommodation = await supabase
    .from("accommodations")
    .select("id,place_id")
    .eq("id", accommodationId)
    .eq("trip_id", tripId)
    .single();

  if (accommodation.error || !accommodation.data) {
    return Response.json({ error: "A hospedagem foi escolhida, mas não pôde ser atualizada com a origem." }, { status: 500 });
  }

  const accommodationPatch = await supabase
    .from("accommodations")
    .update({
      source: "scrappa_booking",
      external_id: quote.data.external_id,
      source_url: quote.data.source_url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accommodationId)
    .eq("trip_id", tripId);

  if (accommodationPatch.error) {
    return Response.json({ error: "Não foi possível registrar a origem da hospedagem." }, { status: 500 });
  }

  if (accommodation.data.place_id) {
    const placePatch: Record<string, unknown> = {
      source: "scrappa_booking",
      external_id: quote.data.external_id,
      source_url: quote.data.source_url,
      updated_at: new Date().toISOString(),
    };
    if (quote.data.address) placePatch.address = quote.data.address;
    if (quote.data.latitude != null) placePatch.latitude = quote.data.latitude;
    if (quote.data.longitude != null) placePatch.longitude = quote.data.longitude;

    const placeUpdate = await supabase
      .from("places")
      .update(placePatch)
      .eq("id", accommodation.data.place_id)
      .eq("trip_id", tripId);

    if (placeUpdate.error) {
      return Response.json({ error: "Hospedagem escolhida, mas a localização não pôde ser atualizada." }, { status: 500 });
    }
  }

  return Response.json({ accommodationId });
}
