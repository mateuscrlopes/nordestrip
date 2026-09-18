import {
  getPluggyApiKey,
  getPluggyItem,
  isPluggyConfigured,
  listPluggyAccounts,
  listPluggyTransactions,
  type PluggyAccount,
  type PluggyTransaction,
} from "@/lib/integrations/pluggy";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

type RequestBody = {
  lifeosUserId?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
};

function bearerToken(request: Request) {
  const raw = request.headers.get("authorization") || "";
  return raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : "";
}

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

function direction(transaction: PluggyTransaction, account: PluggyAccount) {
  const type = stringValue(transaction.type)?.toUpperCase();
  if (type === "DEBIT") return "debit";
  if (type === "CREDIT") return "credit";

  const amount = numberValue(transaction.amount);
  if (amount == null) return null;
  if (account.type === "CREDIT") return amount >= 0 ? "debit" : "credit";
  return amount < 0 ? "debit" : "credit";
}

function normalizeDate(value: unknown) {
  const text = stringValue(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function defaultDateFrom() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 120);
  return d.toISOString().slice(0, 10);
}

function clampDateFrom(value: string | null) {
  const fallback = defaultDateFrom();
  if (!value) return fallback;

  const requested = new Date(value + "T00:00:00Z");
  const oldest = new Date();
  oldest.setUTCDate(oldest.getUTCDate() - 180);
  if (Number.isNaN(requested.getTime())) return fallback;
  return requested < oldest ? oldest.toISOString().slice(0, 10) : value;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return Response.json({ error: "Credencial ausente." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const lifeosUserId = stringValue(body.lifeosUserId);
  if (!lifeosUserId || !/^[0-9a-f-]{36}$/i.test(lifeosUserId)) {
    return Response.json({ error: "Usuário do LifeOS inválido." }, { status: 400 });
  }

  if (!isPluggyConfigured()) {
    return Response.json({ error: "Open Finance indisponível no servidor." }, { status: 503 });
  }

  const { url, key } = getSupabaseEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const context = await supabase.rpc("lifeos_open_finance_context", {
    p_lifeos_user_id: lifeosUserId,
    p_token: token,
  });

  if (context.error) {
    if (context.error.code === "42501" || /unauthorized/i.test(context.error.message || "")) {
      return Response.json({ error: "Credencial inválida." }, { status: 401 });
    }
    return Response.json({ error: "Não foi possível validar a integração." }, { status: 500 });
  }

  const contextData = context.data && typeof context.data === "object"
    ? context.data as { status?: unknown; item_ids?: unknown }
    : {};
  const itemIds = Array.isArray(contextData.item_ids)
    ? contextData.item_ids.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];

  if (!itemIds.length) {
    return Response.json({
      connected: false,
      accounts: [],
      transactions: [],
      syncedAt: new Date().toISOString(),
    });
  }

  const dateFrom = clampDateFrom(normalizeDate(body.dateFrom));
  const dateTo = normalizeDate(body.dateTo) || new Date().toISOString().slice(0, 10);

  try {
    const apiKey = await getPluggyApiKey();
    const accounts: Record<string, unknown>[] = [];
    const transactions: Record<string, unknown>[] = [];
    const errors: { itemId: string; code: string }[] = [];

    for (const itemId of itemIds) {
      try {
        const item = await getPluggyItem(apiKey, itemId);
        const connectorName = item.connector?.name?.toLocaleLowerCase("pt-BR") ?? "";
        const isMeuPluggy = item.connector?.id === 200 || connectorName === "meupluggy";
        if (!isMeuPluggy) {
          errors.push({ itemId, code: "connector_not_allowed" });
          continue;
        }

        const itemAccounts = await listPluggyAccounts(apiKey, itemId);

        for (const account of itemAccounts) {
          if (!account.id) continue;

          accounts.push({
            externalId: account.id,
            itemId,
            name: account.marketingName || account.name || "Conta conectada",
            accountType: accountType(account),
            subtype: account.accountSubtype ?? account.subtype ?? null,
            balance: numberValue(account.balance),
            creditLimit: numberValue(account.creditData?.creditLimit),
            availableCreditLimit: numberValue(account.creditData?.availableCreditLimit),
            automaticallyInvestedBalance: numberValue(account.bankData?.automaticallyInvestedBalance),
            currency: account.currencyCode || "BRL",
            connectorName: item.connector?.name ?? "MeuPluggy",
            itemStatus: item.status ?? null,
            itemExecutionStatus: item.executionStatus ?? null,
          });

          const accountTransactions = await listPluggyTransactions(apiKey, account.id, {
            dateFrom,
            dateTo,
          });

          for (const transaction of accountTransactions) {
            const amount = numberValue(transaction.amount);
            if (!transaction.id || amount == null) continue;

            transactions.push({
              externalId: transaction.id,
              accountExternalId: account.id,
              itemId,
              description: stringValue(transaction.description)
                || stringValue(transaction.descriptionRaw)
                || "Transação",
              amount,
              direction: direction(transaction, account),
              occurredAt: stringValue(transaction.date),
              category: stringValue(transaction.category),
              categoryId: stringValue(transaction.categoryId),
              type: stringValue(transaction.type),
              status: stringValue(transaction.status),
              merchant: stringValue(transaction.merchant?.name)
                || stringValue(transaction.merchant?.businessName),
              currency: stringValue(transaction.currencyCode) || account.currencyCode || "BRL",
            });
          }
        }
      } catch {
        errors.push({ itemId, code: "sync_failed" });
      }
    }

    return Response.json({
      connected: accounts.length > 0,
      dateFrom,
      dateTo,
      accounts,
      transactions,
      errors,
      syncedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar suas contas conectadas agora." },
      { status: 502 }
    );
  }
}
