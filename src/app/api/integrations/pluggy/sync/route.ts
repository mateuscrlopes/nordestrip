import { getPluggyApiKey, getPluggyItem, isPluggyConfigured, listPluggyAccounts, type PluggyAccount } from "@/lib/integrations/pluggy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SyncRequest = {
  tripId?: unknown;
  itemId?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function accountType(account: PluggyAccount) {
  if (account.type === "CREDIT") return "credit_card";
  if (account.type === "BANK") return "checking";
  return "other";
}

function defaultPurpose(account: PluggyAccount) {
  return account.type === "CREDIT" ? "payment_card" : "personal";
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
    items.push({
      id: legacyItemId,
      connector_name: stringValue(root.connector_name) || "MeuPluggy",
      status: stringValue(root.item_status),
      execution_status: stringValue(root.item_execution_status),
      accounts_synced: numberValue(root.accounts_synced),
    });
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

  let body: SyncRequest;
  try {
    body = await request.json() as SyncRequest;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = stringValue(body.tripId);
  const itemId = stringValue(body.itemId);
  if (!tripId || !itemId) {
    return Response.json({ error: "Viagem ou conexão não informada." }, { status: 400 });
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

  const existingConnection = await supabase
    .from("integration_connections")
    .select("id,external_connection_id,metadata")
    .eq("trip_id", tripId)
    .eq("owner_user_id", user.id)
    .eq("provider", "pluggy")
    .eq("purpose", "open_finance")
    .is("archived_at", null)
    .maybeSingle();

  if (existingConnection.error) {
    return Response.json({ error: "Não foi possível carregar a integração financeira." }, { status: 500 });
  }

  const savedItemId = stringValue(existingConnection.data?.external_connection_id);

  if (!isPluggyConfigured()) {
    return Response.json(
      { error: "Pluggy ainda não está configurado no servidor." },
      { status: 503 }
    );
  }

  try {
    const apiKey = await getPluggyApiKey();
    const item = await getPluggyItem(apiKey, itemId);
    const expectedClientUserId = `${tripId}:${user.id}`;

    if (item.id !== itemId || item.clientUserId !== expectedClientUserId) {
      return Response.json({ error: "A conexão financeira não pertence a este usuário." }, { status: 403 });
    }

    const accounts = await listPluggyAccounts(apiKey, itemId);
    const now = new Date().toISOString();
    let synced = 0;

    for (const account of accounts) {
      if (!account.id) continue;

      const type = accountType(account);
      const metadata = {
        pluggy_item_id: itemId,
        pluggy_type: account.type ?? null,
        subtype: account.accountSubtype ?? account.subtype ?? null,
        marketing_name: account.marketingName ?? null,
        available_credit_limit: numberValue(account.creditData?.availableCreditLimit),
        connector_name: item.connector?.name ?? null,
      };

      const accountSave = await supabase
        .from("financial_accounts")
        .upsert(
          {
            owner_user_id: user.id,
            provider: "pluggy",
            external_id: account.id,
            display_name: account.marketingName || account.name || "Conta conectada",
            account_type: type,
            currency: account.currencyCode || "BRL",
            current_balance: numberValue(account.balance),
            credit_limit: numberValue(account.creditData?.creditLimit),
            automatically_invested_balance: numberValue(account.bankData?.automaticallyInvestedBalance),
            last_synced_at: now,
            metadata,
            updated_at: now,
            archived_at: null,
          },
          { onConflict: "provider,external_id" }
        )
        .select("id")
        .single();

      if (accountSave.error || !accountSave.data?.id) {
        throw new Error("financial-account-save");
      }

      const links = await supabase
        .from("trip_financial_accounts")
        .select("id,archived_at")
        .eq("trip_id", tripId)
        .eq("financial_account_id", accountSave.data.id);

      if (links.error) {
        throw new Error("financial-account-link-read");
      }

      if (!links.data?.length) {
        const linkSave = await supabase
          .from("trip_financial_accounts")
          .insert({
            trip_id: tripId,
            financial_account_id: accountSave.data.id,
            purpose: defaultPurpose(account),
            include_balance_in_available: false,
          });

        if (linkSave.error) {
          throw new Error("financial-account-link-save");
        }
      }

      synced += 1;
    }

    const existingMetadata = recordValue(existingConnection.data?.metadata);
    const accountNames = Array.from(new Set(
      accounts
        .map((account) => account.marketingName || account.name)
        .filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
    ));
    const items = storedItems(existingMetadata, savedItemId)
      .filter((storedItem) => storedItem.id !== itemId);

    items.push({
      id: itemId,
      connector_name: item.connector?.name ?? "MeuPluggy",
      status: item.status ?? null,
      execution_status: item.executionStatus ?? null,
      accounts_synced: synced,
      account_names: accountNames,
      last_success_at: now,
    });

    const connectionSave = await supabase
      .from("integration_connections")
      .upsert(
        {
          trip_id: tripId,
          owner_user_id: user.id,
          provider: "pluggy",
          purpose: "open_finance",
          status: "connected",
          external_connection_id: savedItemId || itemId,
          last_success_at: now,
          last_sync_at: now,
          last_error_at: null,
          last_error_message: null,
          metadata: {
            ...existingMetadata,
            item_status: item.status ?? null,
            item_execution_status: item.executionStatus ?? null,
            connector_name: item.connector?.name ?? null,
            accounts_synced: synced,
            items,
          },
          updated_at: now,
          archived_at: null,
        },
        { onConflict: "trip_id,owner_user_id,provider,purpose" }
      );

    if (connectionSave.error) {
      throw new Error("connection-save");
    }

    return Response.json({
      connected: true,
      itemId,
      accountsSynced: synced,
      accountNames,
    });
  } catch {
    const now = new Date().toISOString();
    if (existingConnection.data?.id) {
      await supabase
        .from("integration_connections")
        .update({
          status: "needs_attention",
          last_error_at: now,
          last_error_message: "Não foi possível sincronizar a conexão financeira.",
          updated_at: now,
        })
        .eq("id", existingConnection.data.id);
    }

    return Response.json(
      { error: "Não foi possível sincronizar as contas da Pluggy agora." },
      { status: 502 }
    );
  }
}
