import { isScrappaConfigured } from "@/lib/integrations/scrappa";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { configured: isScrappaConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
