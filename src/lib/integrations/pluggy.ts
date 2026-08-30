const PLUGGY_API_URL = "https://api.pluggy.ai";

export class PluggyApiError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "PluggyApiError";
  }
}

type PluggyAccount = {
  id?: unknown;
  itemId?: unknown;
  type?: unknown;
  subtype?: unknown;
  name?: unknown;
  marketingName?: unknown;
  number?: unknown;
  balance?: unknown;
  currencyCode?: unknown;
  bankData?: {
    automaticallyInvestedBalance?: unknown;
  } | null;
  creditData?: {
    creditLimit?: unknown;
    availableCreditLimit?: unknown;
  } | null;
};

type PluggyAccountsResponse = {
  results?: PluggyAccount[];
};

function env() {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PluggyApiError("Credenciais da Pluggy ainda não configuradas.", 503);
  }
  return { clientId, clientSecret };
}

async function apiKey() {
  const { clientId, clientSecret } = env();
  const response = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PluggyApiError("Não foi possível autenticar com a Pluggy.");
  }

  const data = await response.json() as { apiKey?: unknown };
  if (typeof data.apiKey !== "string" || !data.apiKey) {
    throw new PluggyApiError("A Pluggy não retornou uma chave de acesso válida.");
  }
  return data.apiKey;
}

export function isPluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

export async function createPluggyConnectToken({
  clientUserId,
  itemId,
}: {
  clientUserId: string;
  itemId?: string | null;
}) {
  const key = await apiKey();
  const response = await fetch(`${PLUGGY_API_URL}/connect_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({
      ...(itemId ? { itemId } : {}),
      options: {
        clientUserId,
        avoidDuplicates: true,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PluggyApiError("Não foi possível iniciar a conexão com a Pluggy.");
  }

  const data = await response.json() as { accessToken?: unknown };
  if (typeof data.accessToken !== "string" || !data.accessToken) {
    throw new PluggyApiError("A Pluggy não retornou uma autorização válida.");
  }
  return data.accessToken;
}

export async function listPluggyAccounts(itemId: string) {
  const key = await apiKey();
  const response = await fetch(
    `${PLUGGY_API_URL}/accounts?itemId=${encodeURIComponent(itemId)}`,
    {
      headers: { "X-API-KEY": key },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new PluggyApiError("Não foi possível sincronizar as contas da Pluggy.");
  }

  const data = await response.json() as PluggyAccountsResponse;
  if (!Array.isArray(data.results)) {
    throw new PluggyApiError("A Pluggy retornou uma lista de contas inválida.");
  }
  return data.results;
}

export function normalizePluggyAccount(account: PluggyAccount) {
  const id = typeof account.id === "string" ? account.id : "";
  if (!id) return null;

  const type = typeof account.type === "string" ? account.type.toUpperCase() : "";
  const subtype = typeof account.subtype === "string" ? account.subtype : null;
  const displayName =
    (typeof account.marketingName === "string" && account.marketingName.trim())
    || (typeof account.name === "string" && account.name.trim())
    || "Conta Pluggy";
  const balance =
    typeof account.balance === "number" && Number.isFinite(account.balance)
      ? account.balance
      : null;
  const creditLimit =
    typeof account.creditData?.creditLimit === "number"
      && Number.isFinite(account.creditData.creditLimit)
      ? account.creditData.creditLimit
      : null;
  const availableCreditLimit =
    typeof account.creditData?.availableCreditLimit === "number"
      && Number.isFinite(account.creditData.availableCreditLimit)
      ? account.creditData.availableCreditLimit
      : null;
  const automaticallyInvestedBalance =
    typeof account.bankData?.automaticallyInvestedBalance === "number"
      && Number.isFinite(account.bankData.automaticallyInvestedBalance)
      ? account.bankData.automaticallyInvestedBalance
      : null;

  return {
    externalId: id,
    itemId: typeof account.itemId === "string" ? account.itemId : null,
    displayName,
    accountType: type === "CREDIT" ? "credit_card" : type === "BANK" ? "checking" : "other",
    purpose: type === "CREDIT" ? "payment_card" : "personal",
    currency: typeof account.currencyCode === "string" && account.currencyCode ? account.currencyCode : "BRL",
    currentBalance: balance,
    creditLimit,
    automaticallyInvestedBalance,
    metadata: {
      subtype,
      number: typeof account.number === "string" ? account.number : null,
      item_id: typeof account.itemId === "string" ? account.itemId : null,
      available_credit_limit: availableCreditLimit,
      source: "pluggy",
    },
  };
}
