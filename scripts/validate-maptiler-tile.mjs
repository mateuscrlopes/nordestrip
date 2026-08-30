const key = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
if (!key) {
  console.error("[maptiler-check] NEXT_PUBLIC_MAPTILER_KEY missing");
  process.exit(41);
}

const origin = "https://deploy-preview-1--nordestrip.netlify.app";
const url =
  `https://api.maptiler.com/maps/streets-v4/256/2/1/1.png?key=${encodeURIComponent(key)}`;

try {
  const response = await fetch(url, {
    headers: {
      Origin: origin,
      Referer: `${origin}/mapa`,
    },
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.startsWith("image/")) {
    console.error(
      `[maptiler-check] tile failed HTTP ${response.status}, content-type ${contentType}`
    );
    process.exit(42);
  }

  console.log("[maptiler-check] OK — raster tile authenticated");
} catch (error) {
  console.error(
    "[maptiler-check] request failed",
    error instanceof Error ? error.message : "unknown"
  );
  process.exit(43);
}
