import { createPluggyConnectToken, getPluggyApiKey, isPluggyConfigured } from "@/lib/integrations/pluggy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ConnectTokenRequest = {
  tripId?: unknown;
  itemId?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: ConnectTokenRequest;
  try {
    body = await request.json() as ConnectTokenRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = stringValue(body.tripId);
  const requestedItemId = stringValue(body.itemId);
  if (!tripId) {
    return Response.json({ error: "Viagem não informada." }, { status: 400 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership.error) {
    return Response.json({ error: "Não foi possível validar o acesso à viagem." }, { status: 500 });
  }
  if (!membership.data) {
    return Response.json({ error: "Acesso negado para esta viagem." }, { status: 403 });
  }

  const connection = await supabase
    .from("integration_connections")
    .select("id,status,external_connection_id,metadata")
    .eq("trip_id", tripId)
    .eq("owner_user_id", user.id)
    .eq("provider", "pluggy")
    .eq("purpose", "open_finance")
    .is("archived_at", null)
    .maybeSingle();

  if (connection.error) {
    return Response.json({ error: "Não foi possível carregar a integração financeira." }, { status: 500 });
  }

  const currentItemId = stringValue(connection.data?.external_connection_id);
  if (requestedItemId && requestedItemId !== currentItemId) {
    return Response.json({ error: "A conexão informada não pertence a este acesso." }, { status: 403 });
  }

  if (!isPluggyConfigured()) {
    return Response.json(
      { error: "Pluggy ainda não está configurado no servidor." },
      { status: 503 }
    );
  }

  try {
    const apiKey = await getPluggyApiKey();
    const accessToken = await createPluggyConnectToken(apiKey, {
      clientUserId: `${tripId}:${user.id}`,
      itemId: requestedItemId,
    });

    const now = new Date().toISOString();
    const existingMetadata = objectValue(connection.data?.metadata);
    const save = await supabase
      .from("integration_connections")
      .upsert(
        {
          trip_id: tripId,
          owner_user_id: user.id,
          provider: "pluggy",
          purpose: "open_finance",
          status: currentItemId
            ? String(connection.data?.status || "connected")
            : "configured",
          metadata: {
            ...existingMetadata,
            connect_token_generated_at: now,
          },
          updated_at: now,
          archived_at: null,
        },
        { onConflict: "trip_id,owner_user_id,provider,purpose" }
      );

    if (save.error) {
      return Response.json({ error: "Não foi possível preparar a conexão financeira." }, { status: 500 });
    }

    return Response.json({
      accessToken,
      includeSandbox: process.env.PLUGGY_INCLUDE_SANDBOX === "true",
    });
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar a conexão com a Pluggy agora." },
      { status: 502 }
    );
  }
}
