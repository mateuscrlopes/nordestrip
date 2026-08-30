export const dynamic = "force-dynamic";

type ProviderCheck = {
  configured: boolean;
  ok: boolean;
  status: number | null;
  distanceMeters?: number | null;
};

export async function GET(request: Request) {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
  const orsKey = process.env.OPENROUTESERVICE_API_KEY || "";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "deploy-preview-1--nordestrip.netlify.app";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;

  let maptiler: ProviderCheck = {
    configured: Boolean(mapTilerKey),
    ok: false,
    status: null,
  };

  let openrouteservice: ProviderCheck = {
    configured: Boolean(orsKey),
    ok: false,
    status: null,
  };

  if (mapTilerKey) {
    try {
      const response = await fetch(
        `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapTilerKey)}`,
        {
          headers: {
            Origin: origin,
            Referer: `${origin}/mapa`,
          },
          cache: "no-store",
        }
      );

      maptiler = {
        configured: true,
        ok: response.ok,
        status: response.status,
      };
    } catch {
      maptiler = {
        configured: true,
        ok: false,
        status: null,
      };
    }
  }

  if (orsKey) {
    try {
      const response = await fetch(
        "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
        {
          method: "POST",
          headers: {
            Accept: "application/geo+json",
            Authorization: orsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: [
              [-34.871389, -8.061111],
              [-34.869983, -8.060091],
            ],
            instructions: false,
          }),
          cache: "no-store",
        }
      );

      let distanceMeters: number | null = null;

      if (response.ok) {
        const data = await response.json() as {
          features?: Array<{
            properties?: {
              summary?: {
                distance?: number;
              };
            };
          }>;
        };

        distanceMeters = data.features?.[0]?.properties?.summary?.distance ?? null;
      }

      openrouteservice = {
        configured: true,
        ok: response.ok,
        status: response.status,
        distanceMeters,
      };
    } catch {
      openrouteservice = {
        configured: true,
        ok: false,
        status: null,
      };
    }
  }

  return Response.json({
    maptiler,
    openrouteservice,
  });
}
