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
          avoidDuplicates: true,
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
