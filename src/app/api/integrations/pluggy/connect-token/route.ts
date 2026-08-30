import { createPluggyConnectToken, PluggyApiError } from "@/lib/integrations/pluggy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RequestBody = {
  tripId?: unknown;
  itemId?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const itemId = typeof body.itemId === "string" && body.itemId ? body.itemId : null;
  if (!tripId) return Response.json({ error: "Viagem não informada." }, { status: 400 });

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return Response.json({ error: "Acesso negado para esta viagem." }, { status: 403 });
  }

  try {
    const accessToken = await createPluggyConnectToken({
      clientUserId: `${tripId}:${user.id}`,
      itemId,
    });

    await supabase
      .from("integration_connections")
      .update({
        status: itemId ? "connected" : "configured",
        last_error_at: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("trip_id", tripId)
      .eq("provider", "pluggy")
      .eq("purpose", "open_finance");

    return Response.json({ accessToken });
  } catch (error) {
    const status = error instanceof PluggyApiError ? error.status : 502;
    const message = error instanceof PluggyApiError
      ? error.message
      : "Falha de comunicação com a Pluggy.";

    if (status !== 503) {
      await supabase
        .from("integration_connections")
        .update({
          status: "needs_attention",
          last_error_at: new Date().toISOString(),
          last_error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("trip_id", tripId)
        .eq("provider", "pluggy")
        .eq("purpose", "open_finance");
    }

    return Response.json({ error: message }, { status });
  }
}
