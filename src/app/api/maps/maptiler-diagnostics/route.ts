import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function sanitizeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    url.searchParams.delete("key");
    return url.toString();
  } catch {
    return value.replace(/([?&]key=)[^&]+/gi, "$1REDACTED");
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";
  if (!key) return Response.json({ configured: false }, { status: 503 });

  const requestUrl = new URL(request.url);
  const browserOrigin = requestUrl.origin;
  const styleUrl = `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(key)}`;

  try {
    const styleResponse = await fetch(styleUrl, {
      headers: {
        Origin: browserOrigin,
        Referer: `${browserOrigin}/mapa`,
      },
      cache: "no-store",
    });

    const styleText = await styleResponse.text();
    let style: Record<string, unknown> | null = null;
    try {
      style = JSON.parse(styleText) as Record<string, unknown>;
    } catch {}

    const sources = style?.sources && typeof style.sources === "object" && !Array.isArray(style.sources)
      ? style.sources as Record<string, Record<string, unknown>>
      : {};

    const sourceUrls = Object.values(sources)
      .map((source) => sanitizeUrl(source?.url))
      .filter((value): value is string => Boolean(value));

    const rawSourceUrls = Object.values(sources)
      .map((source) => typeof source?.url === "string" ? source.url : null)
      .filter((value): value is string => Boolean(value));

    const sampleSource = rawSourceUrls[0] || null;
    let sourceStatus: number | null = null;
    let sourceOk = false;

    if (sampleSource) {
      const resolved = sampleSource.includes("{key}")
        ? sampleSource.replaceAll("{key}", encodeURIComponent(key))
        : sampleSource;
      const response = await fetch(resolved, {
        headers: {
          Origin: browserOrigin,
          Referer: `${browserOrigin}/mapa`,
        },
        cache: "no-store",
      });
      sourceStatus = response.status;
      sourceOk = response.ok;
    }

    return Response.json({
      configured: true,
      browserOrigin,
      style: {
        ok: styleResponse.ok,
        status: styleResponse.status,
        parsed: Boolean(style),
        name: typeof style?.name === "string" ? style.name : null,
        sprite: sanitizeUrl(style?.sprite),
        glyphs: sanitizeUrl(style?.glyphs),
        sourceCount: Object.keys(sources).length,
        sourceUrls,
      },
      sampleSource: {
        present: Boolean(sampleSource),
        ok: sourceOk,
        status: sourceStatus,
      },
    });
  } catch {
    return Response.json({ configured: true, error: "Falha ao consultar MapTiler." }, { status: 502 });
  }
}
