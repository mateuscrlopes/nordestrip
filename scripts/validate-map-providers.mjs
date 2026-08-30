const isNetlify = process.env.NETLIFY === "true";

if (!isNetlify) {
  console.log("[maps-check] skipped outside Netlify");
  process.exit(0);
}

const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
const orsKey = process.env.OPENROUTESERVICE_API_KEY || "";

if (!mapTilerKey) {
  console.error("[maps-check] NEXT_PUBLIC_MAPTILER_KEY missing");
  process.exit(31);
}

if (!orsKey) {
  console.error("[maps-check] OPENROUTESERVICE_API_KEY missing");
  process.exit(32);
}

const previewOrigin = "https://deploy-preview-1--nordestrip.netlify.app";

try {
  const mapResponse = await fetch(
    `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(mapTilerKey)}`,
    {
      headers: {
        Origin: previewOrigin,
        Referer: `${previewOrigin}/mapa`,
      },
    }
  );

  if (!mapResponse.ok) {
    console.error(`[maps-check] MapTiler HTTP ${mapResponse.status}`);
    process.exit(33);
  }

  const routeResponse = await fetch(
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
    }
  );

  if (!routeResponse.ok) {
    console.error(`[maps-check] openrouteservice HTTP ${routeResponse.status}`);
    process.exit(34);
  }

  const route = await routeResponse.json();
  const distance = route?.features?.[0]?.properties?.summary?.distance;

  if (typeof distance !== "number" || distance <= 0) {
    console.error("[maps-check] openrouteservice returned no usable route");
    process.exit(35);
  }

  console.log(`[maps-check] OK — MapTiler authenticated; openrouteservice route ${Math.round(distance)}m`);
} catch (error) {
  console.error("[maps-check] provider request failed", error instanceof Error ? error.message : "unknown");
  process.exit(36);
}
