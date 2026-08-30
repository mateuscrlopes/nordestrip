import {
  getPluggyApiKey,
  getPluggyItem,
  isPluggyConfigured,
  listPluggyAccounts,
  listPluggyTransactions,
  type PluggyAccount,
  type PluggyTransaction,
} from "@/lib/integrations/pluggy";
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

function transactionDirection(transaction: PluggyTransaction, account: PluggyAccount) {
  const type = stringValue(transaction.type)?.toUpperCase();
  if (type === "DEBIT") return "debit";
  if (type === "CREDIT") return "credit";

  const amount = numberValue(transaction.amount);
  if (amount == null) return null;

  if (account.type === "CREDIT") {
    return amount >= 0 ? "debit" : "credit";
  }

  return amount < 0 ? "debit" : "credit";
}

function transactionPostingStatus(transaction: PluggyTransaction) {
  return stringValue(transaction.status)?.toUpperCase() === "PENDING"
    ? "pending"
    : "posted";
}

function transactionDescription(transaction: PluggyTransaction) {
  return stringValue(transaction.description)
    || stringValue(transaction.descriptionRaw)
    || "Transação";
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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

  const [existingConnection, tripResult] = await Promise.all([
    supabase
      .from("integration_connections")
      .select("id,external_connection_id,metadata")
      .eq("trip_id", tripId)
      .eq("owner_user_id", user.id)
      .eq("provider", "pluggy")
      .eq("purpose", "open_finance")
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("trips")
      .select("created_at")
      .eq("id", tripId)
      .maybeSingle(),
  ]);

  if (existingConnection.error) {
    return Response.json({ error: "Não foi possível carregar a integração financeira." }, { status: 500 });
  }
  if (tripResult.error) {
    return Response.json({ error: "Não foi possível carregar a janela financeira da viagem." }, { status: 500 });
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
    const connectorName = item.connector?.name?.toLocaleLowerCase("pt-BR") ?? "";
    const isMeuPluggy = item.connector?.id === 200 || connectorName === "meupluggy";

    if (item.id !== itemId || !isMeuPluggy) {
      return Response.json(
        { error: "Este Item ID não corresponde a uma conexão Meu Pluggy desta aplicação." },
        { status: 403 }
      );
    }

    const pluggyAccounts = await listPluggyAccounts(apiKey, itemId);
    const now = new Date().toISOString();
    const savedAccounts = new Map<string, string>();
    let synced = 0;

    for (const account of pluggyAccounts) {
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

      savedAccounts.set(account.id, accountSave.data.id);
      synced += 1;
    }

    const savedAccountIds = Array.from(savedAccounts.values());
    const activeAccountIds = new Set<string>();

    if (savedAccountIds.length) {
      const activeLinks = await supabase
        .from("trip_financial_accounts")
        .select("financial_account_id")
        .eq("trip_id", tripId)
        .in("financial_account_id", savedAccountIds)
        .is("archived_at", null);

      if (activeLinks.error) {
        throw new Error("financial-account-link-read");
      }

      for (const link of activeLinks.data ?? []) {
        activeAccountIds.add(link.financial_account_id);
      }
    }

    const createdAt = stringValue(tripResult.data?.created_at);
    const dateFrom = createdAt ? createdAt.slice(0, 10) : null;
    let transactionsSynced = 0;

    for (const account of pluggyAccounts) {
      const financialAccountId = account.id ? savedAccounts.get(account.id) : null;
      if (!account.id || !financialAccountId || !activeAccountIds.has(financialAccountId)) {
        continue;
      }

      const transactions = await listPluggyTransactions(apiKey, account.id, { dateFrom });
      const rows: Record<string, unknown>[] = [];

      for (const transaction of transactions) {
        const amount = numberValue(transaction.amount);
        if (!transaction.id || amount == null) continue;

        rows.push({
          financial_account_id: financialAccountId,
          trip_id: tripId,
          provider: "pluggy",
          external_id: transaction.id,
          description: transactionDescription(transaction),
          amount,
          currency: stringValue(transaction.currencyCode) || account.currencyCode || "BRL",
          occurred_at: stringValue(transaction.date),
          direction: transactionDirection(transaction, account),
          posting_status: transactionPostingStatus(transaction),
          is_transfer: false,
          raw_payload: transaction,
          updated_at: now,
        });
      }

      for (const batch of chunks(rows, 250)) {
        const save = await supabase
          .from("financial_transactions")
          .upsert(batch, { onConflict: "provider,external_id" });

        if (save.error) {
          throw new Error("financial-transaction-save");
        }
      }

      transactionsSynced += rows.length;
    }

    const existingMetadata = recordValue(existingConnection.data?.metadata);
    const accountNames = Array.from(new Set(
      pluggyAccounts
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
      transactions_synced: transactionsSynced,
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
            transactions_synced: transactionsSynced,
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
      transactionsSynced,
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
      { error: "Não foi possível sincronizar as contas e transações da Pluggy agora." },
      { status: 502 }
    );
  }
}
