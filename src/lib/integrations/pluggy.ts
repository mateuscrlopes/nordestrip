const PLUGGY_API_URL = "https://api.pluggy.ai";

export type PluggyItem = {
  id: string;
  clientUserId?: string | null;
  status?: string | null;
  executionStatus?: string | null;
  connector?: {
    id?: number | null;
    name?: string | null;
  } | null;
};

export type PluggyAccount = {
  id: string;
  itemId?: string | null;
  type?: string | null;
  subtype?: string | null;
  accountSubtype?: string | null;
  name?: string | null;
  marketingName?: string | null;
  balance?: number | null;
  currencyCode?: string | null;
  bankData?: {
    automaticallyInvestedBalance?: number | null;
  } | null;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
  } | null;
};

type PluggyList<T> = {
  results?: T[];
};

export type PluggyConnector = {
  id: number;
  name: string;
  oauth?: boolean | null;
  isSandbox?: boolean | null;
};

async function pluggyRequest<T>(
  path: string,
  init: RequestInit,
  context: string
): Promise<T> {
  const response = await fetch(`${PLUGGY_API_URL}${path}`, {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${context}:${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function isPluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

export async function getPluggyApiKey() {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("pluggy-not-configured");
  }

  const data = await pluggyRequest<{ apiKey?: unknown }>(
    "/auth",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    },
    "pluggy-auth"
  );

  if (typeof data.apiKey !== "string" || !data.apiKey) {
    throw new Error("pluggy-auth-invalid");
  }

  return data.apiKey;
}

export async function createPluggyConnectToken(
  apiKey: string,
  options: {
    clientUserId: string;
    itemId?: string | null;
    oauthRedirectUri?: string | null;
    avoidDuplicates?: boolean;
  }
) {
  const data = await pluggyRequest<{ accessToken?: unknown }>(
    "/connect_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        ...(options.itemId ? { itemId: options.itemId } : {}),
        options: {
          clientUserId: options.clientUserId,
          avoidDuplicates: options.avoidDuplicates !== false,
          ...(options.oauthRedirectUri ? { oauthRedirectUri: options.oauthRedirectUri } : {}),
        },
      }),
    },
    "pluggy-connect-token"
  );

  if (typeof data.accessToken !== "string" || !data.accessToken) {
    throw new Error("pluggy-connect-token-invalid");
  }

  return data.accessToken;
}

export async function findPluggyConnector(apiKey: string, name: string) {
  const data = await pluggyRequest<PluggyList<PluggyConnector>>(
    `/connectors?name=${encodeURIComponent(name)}`,
    {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    },
    "pluggy-connectors"
  );

  const connectors = Array.isArray(data.results) ? data.results : [];
  const normalizedName = name.toLocaleLowerCase("pt-BR");
  return connectors.find(
    (connector) => connector.name.toLocaleLowerCase("pt-BR") === normalizedName
  ) ?? connectors[0] ?? null;
}

export async function deletePluggyItem(apiKey: string, itemId: string) {
  const response = await fetch(`${PLUGGY_API_URL}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    cache: "no-store",
  });

  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`pluggy-item-delete:${response.status}`);
  }
}

export async function getPluggyItem(apiKey: string, itemId: string) {
  return pluggyRequest<PluggyItem>(
    `/items/${encodeURIComponent(itemId)}`,
    {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    },
    "pluggy-item"
  );
}

export async function listPluggyAccounts(apiKey: string, itemId: string) {
  const data = await pluggyRequest<PluggyList<PluggyAccount>>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
    },
    "pluggy-accounts"
  );

  return Array.isArray(data.results) ? data.results : [];
}


export type PluggyTransaction = {
  id: string;
  accountId?: string | null;
  description?: string | null;
  descriptionRaw?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  date?: string | null;
  category?: string | null;
  categoryId?: string | null;
  type?: string | null;
  status?: string | null;
  merchant?: {
    name?: string | null;
    businessName?: string | null;
  } | null;
  creditCardMetadata?: Record<string, unknown> | null;
  paymentData?: unknown;
};

type PluggyCursorList<T> = PluggyList<T> & {
  next?: string | null;
};

export async function listPluggyTransactions(
  apiKey: string,
  accountId: string,
  options: { dateFrom?: string | null; dateTo?: string | null } = {}
) {
  const params = new URLSearchParams({ accountId });
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);

  let path = "/v2/transactions?" + params.toString();
  const results: PluggyTransaction[] = [];
  const seenNext = new Set<string>();

  for (let page = 0; page < 50; page += 1) {
    const data = await pluggyRequest<PluggyCursorList<PluggyTransaction>>(
      path,
      {
        headers: {
          Accept: "application/json",
          "X-API-KEY": apiKey,
        },
      },
      "pluggy-transactions"
    );

    if (Array.isArray(data.results)) results.push(...data.results);

    const next = typeof data.next === "string" ? data.next.trim() : "";
    if (!next || seenNext.has(next)) break;
    seenNext.add(next);

    if (next.startsWith("?")) {
      path = "/v2/transactions" + next;
      continue;
    }
    if (next.startsWith("/v2/transactions")) {
      path = next;
      continue;
    }
    if (next.startsWith(PLUGGY_API_URL)) {
      const url = new URL(next);
      path = url.pathname + url.search;
      continue;
    }

    throw new Error("pluggy-transactions-next-invalid");
  }

  return results;
}
