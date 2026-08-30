import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RemoveRequest = {
  tripId?: unknown;
  itemId?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function storedItems(metadata: unknown, legacyItemId: string | null) {
  const root = recordValue(metadata);
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items: Record<string, unknown>[] = [];

  for (const value of rawItems) {
    const item = recordValue(value);
    const id = stringValue(item.id);
    if (!id) continue;
    items.push({ ...item, id });
  }

  if (legacyItemId && !items.some((item) => item.id === legacyItemId)) {
    items.push({ id: legacyItemId, connector_name: "MeuPluggy" });
  }

  return items;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: RemoveRequest;
  try {
    body = await request.json() as RemoveRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = stringValue(body.tripId);
  const itemId = stringValue(body.itemId);
  if (!tripId || !itemId) {
    return Response.json({ error: "Conexão não informada." }, { status: 400 });
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
    .select("id,external_connection_id,metadata")
    .eq("trip_id", tripId)
    .eq("owner_user_id", user.id)
    .eq("provider", "pluggy")
    .eq("purpose", "open_finance")
    .is("archived_at", null)
    .maybeSingle();

  if (connection.error) {
    return Response.json({ error: "Não foi possível carregar a integração financeira." }, { status: 500 });
  }
  if (!connection.data) {
    return Response.json({ error: "Conexão financeira não encontrada." }, { status: 404 });
  }

  const legacyItemId = stringValue(connection.data.external_connection_id);
  const items = storedItems(connection.data.metadata, legacyItemId);
  if (!items.some((item) => item.id === itemId)) {
    return Response.json({ error: "A conexão informada não pertence a este acesso." }, { status: 403 });
  }

  try {
    const accountRows = await supabase
      .from("financial_accounts")
      .select("id,metadata")
      .eq("owner_user_id", user.id)
      .eq("provider", "pluggy")
      .is("archived_at", null);

    if (accountRows.error) {
      throw new Error("financial-accounts-read");
    }

    const accountIds = (accountRows.data ?? [])
      .filter((account) => stringValue(recordValue(account.metadata).pluggy_item_id) === itemId)
      .map((account) => account.id);

    const now = new Date().toISOString();

    if (accountIds.length) {
      const linkArchive = await supabase
        .from("trip_financial_accounts")
        .update({
          include_balance_in_available: false,
          archived_at: now,
          updated_at: now,
        })
        .eq("trip_id", tripId)
        .in("financial_account_id", accountIds);

      if (linkArchive.error) throw new Error("financial-links-archive");

      const accountArchive = await supabase
        .from("financial_accounts")
        .update({
          archived_at: now,
          updated_at: now,
        })
        .eq("owner_user_id", user.id)
        .in("id", accountIds);

      if (accountArchive.error) throw new Error("financial-accounts-archive");
    }

    const remainingItems = items.filter((item) => item.id !== itemId);
    const metadata = recordValue(connection.data.metadata);
    const nextPrimary = remainingItems.length
      ? stringValue(remainingItems[0].id)
      : null;

    const update = await supabase
      .from("integration_connections")
      .update({
        status: remainingItems.length ? "connected" : "configured",
        external_connection_id: nextPrimary,
        metadata: {
          ...metadata,
          items: remainingItems,
        },
        last_error_at: null,
        last_error_message: null,
        updated_at: now,
      })
      .eq("id", connection.data.id);

    if (update.error) throw new Error("connection-update");

    return Response.json({
      removed: true,
      remainingItems: remainingItems.length,
    });
  } catch {
    return Response.json(
      { error: "Não foi possível remover esta conexão do Meu Pluggy agora." },
      { status: 502 }
    );
  }
}
