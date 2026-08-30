import { isGeckoConfigured } from "@/lib/integrations/gecko";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { configured: isGeckoConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
