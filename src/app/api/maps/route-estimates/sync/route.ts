import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SyncRequest = { tripId?: unknown };

type RouteResponse = {
  features?: Array<{
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
};

type LocatedPlace = {
  id: string;
  name: string;
  order: number;
  longitude: number;
  latitude: number;
};

type RouteGroup = {
  stopId: string;
  circuit: string;
  period: string;
  total: number;
  located: LocatedPlace[];
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metadataValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function routeEstimateMatches(value: unknown, placeIds: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const estimate = value as Record<string, unknown>;
  const ids = Array.isArray(estimate.place_ids)
    ? estimate.place_ids.filter((id): id is string => typeof id === "string")
    : [];
  return ids.length === placeIds.length && ids.every((id, index) => id === placeIds[index]);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  let body: SyncRequest;
  try {
    body = await request.json() as SyncRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = textValue(body.tripId);
  if (!tripId) return Response.json({ error: "Viagem não informada." }, { status: 400 });

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Provedor de rotas não configurado." }, { status: 503 });
  }

  const [membership, items, places, preferences] = await Promise.all([
    supabase.from("trip_members").select("id").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("itinerary_items")
      .select("id,stop_id,place_id,period,priority,status")
      .eq("trip_id", tripId)
      .is("archived_at", null)
      .eq("priority", "high"),
    supabase
      .from("places")
      .select("id,stop_id,name,latitude,longitude,metadata")
      .eq("trip_id", tripId)
      .is("archived_at", null),
    supabase.from("trip_preferences").select("extra").eq("trip_id", tripId).maybeSingle(),
  ]);

  if (membership.error || items.error || places.error || preferences.error) {
    return Response.json({ error: "Não foi possível analisar a geografia do roteiro." }, { status: 500 });
  }
  if (!membership.data) return Response.json({ error: "Acesso negado." }, { status: 403 });

  const placeById = new Map((places.data || []).map((place) => [place.id, place]));
  const groups = new Map<string, RouteGroup>();

  for (const item of items.data || []) {
    if (item.status === "cancelled") continue;
    if (!item.stop_id || !item.place_id) continue;
    if (!["morning", "afternoon", "evening"].includes(String(item.period || ""))) continue;

    const place = placeById.get(item.place_id);
    if (!place) continue;

    const metadata = metadataValue(place.metadata);
    const circuit = textValue(metadata.circuit_label) || "Outros locais";
    const period = String(item.period);
    const key = `${item.stop_id}::${circuit}::${period}`;
    const group: RouteGroup = groups.get(key) || {
      stopId: item.stop_id,
      circuit,
      period,
      total: 0,
      located: [],
    };

    group.total += 1;

    const longitude = numberValue(place.longitude);
    const latitude = numberValue(place.latitude);
    if (longitude != null && latitude != null) {
      group.located.push({
        id: place.id,
        name: place.name,
        order: numberValue(metadata.circuit_order) ?? 999,
        longitude,
        latitude,
      });
    }

    groups.set(key, group);
  }

  const extra =
    preferences.data?.extra && typeof preferences.data.extra === "object" && !Array.isArray(preferences.data.extra)
      ? preferences.data.extra as Record<string, unknown>
      : {};
  const currentEstimates =
    extra.route_estimates && typeof extra.route_estimates === "object" && !Array.isArray(extra.route_estimates)
      ? extra.route_estimates as Record<string, unknown>
      : {};

  const pending = Array.from(groups.entries())
    .map(([key, group]) => {
      const located = [...group.located].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
      const placeIds = located.map((place) => place.id);
      return { key, ...group, located, placeIds };
    })
    .filter((group) =>
      group.total >= 2
      && group.located.length === group.total
      && !routeEstimateMatches(currentEstimates[group.key], group.placeIds)
    )
    .slice(0, 8);

  if (!pending.length) {
    return Response.json({ calculated: 0, failed: 0, pending: 0, message: "Geografia já está atualizada." });
  }

  const updates: Record<string, unknown> = {};
  let failed = 0;

  for (const group of pending) {
    try {
      const response = await fetch(
        "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
        {
          method: "POST",
          headers: {
            Accept: "application/geo+json",
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: group.located.map((place) => [place.longitude, place.latitude]),
            instructions: false,
          }),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        failed += 1;
        continue;
      }

      const payload = await response.json() as RouteResponse;
      const summary = payload.features?.[0]?.properties?.summary;
      if (
        typeof summary?.distance !== "number"
        || typeof summary?.duration !== "number"
      ) {
        failed += 1;
        continue;
      }

      updates[group.key] = {
        stop_id: group.stopId,
        circuit_label: group.circuit,
        period: group.period,
        place_ids: group.placeIds,
        distance_meters: Math.round(summary.distance),
        duration_minutes: Math.max(1, Math.round(summary.duration / 60)),
        source: "openrouteservice",
        travel_mode: "walking",
        calculated_at: new Date().toISOString(),
      };
    } catch {
      failed += 1;
    }
  }

  const calculated = Object.keys(updates).length;

  if (calculated > 0) {
    const merged = await supabase.rpc("merge_route_estimates", {
      p_trip_id: tripId,
      p_estimates: updates,
    });
    if (merged.error) {
      return Response.json({ error: "As rotas foram calculadas, mas não puderam ser salvas." }, { status: 500 });
    }
  }

  return Response.json({
    calculated,
    failed,
    pending: Math.max(0, pending.length - calculated - failed),
    message:
      calculated > 0
        ? `${calculated} trajeto${calculated === 1 ? "" : "s"} atualizado${calculated === 1 ? "" : "s"}.`
        : "Nenhum trajeto pôde ser atualizado agora.",
  });
}
