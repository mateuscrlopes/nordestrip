import { createPluggyConnectToken, findPluggyConnector, getPluggyApiKey, isPluggyConfigured } from "@/lib/integrations/pluggy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ConnectTokenRequest = {
  tripId?: unknown;
  itemId?: unknown;
  additional?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function storedItemIds(metadata: unknown, legacyItemId: string | null) {
  const root = objectValue(metadata);
  const items = Array.isArray(root.items) ? root.items : [];
  const ids = new Set<string>();

  if (legacyItemId) ids.add(legacyItemId);

  for (const value of items) {
    const item = objectValue(value);
    const id = stringValue(item.id);
    if (id) ids.add(id);
  }

  return ids;
}

function oauthRedirectUri(request: Request) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(request.url).origin;

  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return null;
    return new URL("/mais?pluggy=return", url).toString();
  } catch {
    return null;
  }
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
  const additional = body.additional === true;
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
  const knownItemIds = storedItemIds(connection.data?.metadata, currentItemId);
  if (requestedItemId && !knownItemIds.has(requestedItemId)) {
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
    const redirectUri = oauthRedirectUri(request);
    const meuPluggy = await findPluggyConnector(apiKey, "MeuPluggy");

    if (!redirectUri) {
      return Response.json(
        { error: "Não foi possível preparar o retorno seguro do Meu Pluggy." },
        { status: 500 }
      );
    }
    if (!meuPluggy?.id) {
      return Response.json(
        { error: "O conector Meu Pluggy não está disponível nesta aplicação." },
        { status: 502 }
      );
    }

    const accessToken = await createPluggyConnectToken(apiKey, {
      clientUserId: `${tripId}:${user.id}`,
      itemId: requestedItemId,
      oauthRedirectUri: redirectUri,
      avoidDuplicates: !(additional && !requestedItemId && knownItemIds.size > 0),
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
            connector_name: meuPluggy.name,
            connector_id: meuPluggy.id,
            connection_mode: "meu_pluggy",
            last_connect_mode:
              additional && !requestedItemId && knownItemIds.size > 0
                ? "additional_item"
                : requestedItemId
                  ? "update_item"
                  : "first_item",
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
      selectedConnectorId: meuPluggy.id,
      includeSandbox: false,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível iniciar a conexão com a Pluggy agora." },
      { status: 502 }
    );
  }
}
