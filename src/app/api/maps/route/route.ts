import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteRequest = {
  coordinates?: unknown;
};

type OrsResponse = {
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
    };
  }>;
};

function validCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Provedor de rotas não configurado." }, { status: 503 });
  }

  let body: RouteRequest;
  try {
    body = await request.json() as RouteRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (
    !Array.isArray(body.coordinates) ||
    body.coordinates.length < 2 ||
    body.coordinates.length > 50 ||
    !body.coordinates.every(validCoordinate)
  ) {
    return Response.json(
      { error: "Envie de 2 a 50 coordenadas válidas no formato [longitude, latitude]." },
      { status: 400 }
    );
  }

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
          coordinates: body.coordinates,
          instructions: false,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return Response.json(
        { error: "Não foi possível calcular a rota agora.", providerStatus: response.status },
        { status: response.status === 429 ? 429 : 502 }
      );
    }

    const data = await response.json() as OrsResponse;
    const feature = data.features?.[0];
    const summary = feature?.properties?.summary;
    const geometry = feature?.geometry;

    if (
      !summary ||
      typeof summary.distance !== "number" ||
      typeof summary.duration !== "number" ||
      geometry?.type !== "LineString" ||
      !Array.isArray(geometry.coordinates)
    ) {
      return Response.json({ error: "O provedor retornou uma rota incompleta." }, { status: 502 });
    }

    return Response.json({
      distanceMeters: summary.distance,
      durationSeconds: summary.duration,
      geometry: {
        type: "LineString",
        coordinates: geometry.coordinates,
      },
      provider: "openrouteservice",
      profile: "foot-walking",
    });
  } catch {
    return Response.json({ error: "Falha de comunicação com o provedor de rotas." }, { status: 502 });
  }
}
