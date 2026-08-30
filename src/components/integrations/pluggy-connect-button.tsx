"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PluggyItemState = {
  id?: string;
  status?: string | null;
  executionStatus?: string | null;
  statusDetail?: string | null;
  error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

type PluggySuccessData = {
  id?: string;
  item?: PluggyItemState;
};

type PluggyConnectError = {
  message?: string;
  data?: {
    item?: PluggyItemState;
  };
};

type PluggyConnectConfig = {
  connectToken: string;
  includeSandbox?: boolean;
  updateItem?: string;
  selectedConnectorId?: number;
  forceOauthInBrowser?: boolean;
  products?: string[];
  language?: string;
  onSuccess?: (data: PluggySuccessData) => void | Promise<void>;
  onError?: (error: PluggyConnectError) => void | Promise<void>;
};

type PluggyConnectInstance = {
  init: () => void;
};

declare global {
  interface Window {
    PluggyConnect?: new (config: PluggyConnectConfig) => PluggyConnectInstance;
  }
}

const SCRIPT_ID = "pluggy-connect-script";
const SCRIPT_URL = "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";

function loadPluggyConnect() {
  if (typeof window === "undefined") return Promise.reject(new Error("browser-required"));
  if (window.PluggyConnect) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const current = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    const done = () => {
      if (window.PluggyConnect) resolve();
      else reject(new Error("pluggy-script-unavailable"));
    };

    if (current) {
      current.addEventListener("load", done, { once: true });
      current.addEventListener("error", () => reject(new Error("pluggy-script-error")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("pluggy-script-error")), { once: true });
    document.head.appendChild(script);
  });
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function pluggyErrorMessage(error: PluggyConnectError) {
  const item = error.data?.item;
  const detail =
    item?.error?.message ||
    item?.statusDetail ||
    item?.executionStatus ||
    item?.status;

  if (error.message && detail && error.message !== detail) {
    return `${error.message} · ${detail}`;
  }
  return error.message || detail || "A conexão com o Meu Pluggy não foi concluída.";
}

type StoredPluggyItem = {
  id: string;
  accountNames: string[];
};

function storedPluggyItems(metadata: unknown, legacyItemId?: string | null) {
  const root =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : {};
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items: StoredPluggyItem[] = [];

  for (const value of rawItems) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id ? record.id : null;
    if (!id) continue;
    const accountNames = Array.isArray(record.account_names)
      ? record.account_names.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
      : [];
    items.push({ id, accountNames });
  }

  if (legacyItemId && !items.some((item) => item.id === legacyItemId)) {
    items.push({ id: legacyItemId, accountNames: [] });
  }

  return items;
}

function itemLabel(item: StoredPluggyItem) {
  if (!item.accountNames.length) return "Meu Pluggy";
  if (item.accountNames.length === 1) return item.accountNames[0];
  return `${item.accountNames[0]} + ${item.accountNames.length - 1}`;
}

export function PluggyConnectButton({
  tripId,
  itemId,
  status,
  metadata,
}: {
  tripId: string;
  itemId?: string | null;
  status: string;
  metadata?: unknown;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const items = storedPluggyItems(metadata, itemId);

  function sessionExpired() {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  async function syncItem(nextItemId: string) {
    const response = await fetch("/api/integrations/pluggy/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, itemId: nextItemId }),
    });

    if (response.status === 401) {
      sessionExpired();
      return;
    }

    if (!response.ok) {
      throw new Error(await responseMessage(response, "Não foi possível sincronizar as contas."));
    }

    const data = await response.json() as { accountsSynced?: number };
    const count = typeof data.accountsSynced === "number" ? data.accountsSynced : 0;
    setMessage(
      count === 1
        ? "1 conta sincronizada."
        : `${count} contas sincronizadas.`
    );
    router.refresh();
  }

  async function open(targetItemId?: string | null, additional = false) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/pluggy/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          itemId: targetItemId || null,
          additional,
        }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }

      if (!response.ok) {
        throw new Error(await responseMessage(response, "Não foi possível iniciar a conexão."));
      }

      const data = await response.json() as {
        accessToken?: unknown;
        selectedConnectorId?: unknown;
        includeSandbox?: unknown;
      };

      if (typeof data.accessToken !== "string" || !data.accessToken) {
        throw new Error("Token de conexão inválido.");
      }

      await loadPluggyConnect();
      if (!window.PluggyConnect) {
        throw new Error("Não foi possível carregar a conexão financeira.");
      }

      const selectedConnectorId =
        typeof data.selectedConnectorId === "number" ? data.selectedConnectorId : null;

      const widget = new window.PluggyConnect({
        connectToken: data.accessToken,
        includeSandbox: data.includeSandbox === true,
        ...(targetItemId ? { updateItem: targetItemId } : {}),
        ...(selectedConnectorId ? { selectedConnectorId } : {}),
        forceOauthInBrowser: true,
        products: ["ACCOUNTS", "CREDIT_CARDS"],
        language: "pt",
        onSuccess: async (result) => {
          const nextItemId = result.item?.id || result.id;
          if (!nextItemId) {
            setMessage("A conexão terminou sem identificar a conta.");
            return;
          }

          setBusy(true);
          setMessage("Sincronizando contas...");
          try {
            await syncItem(nextItemId);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Não foi possível sincronizar as contas.");
          } finally {
            setBusy(false);
          }
        },
        onError: (error) => {
          setMessage(pluggyErrorMessage(error));
          setBusy(false);
        },
      });

      widget.init();
      setBusy(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar a conexão.");
      setBusy(false);
    }
  }

  async function removeItem(item: StoredPluggyItem) {
    const confirmed = window.confirm(
      `Remover ${itemLabel(item)} do Nordestrip? O consentimento será revogado na Pluggy e essas contas deixarão de ser usadas no app.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/pluggy/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, itemId: item.id }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Não foi possível remover a conexão."));
      }

      setMessage("Conexão removida.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-sand/55 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-petrol">{itemLabel(item)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open(item.id)}
                  className="rounded-lg bg-pale-blue/65 px-2.5 py-1.5 text-[10px] font-semibold text-petrol disabled:opacity-55"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeItem(item)}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-muted disabled:opacity-55"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => open(null, items.length > 0)}
        className="inline-flex min-h-9 items-center justify-center rounded-xl bg-petrol px-3 text-[11px] font-semibold text-white transition hover:bg-[#0d303a] disabled:opacity-55"
      >
        {busy
          ? "Aguarde..."
          : items.length
            ? "Adicionar outra conta"
            : status === "connected"
              ? "Adicionar conta"
              : "Conectar Meu Pluggy"}
      </button>

      {message && (
        <span role="status" className="block text-[10px] leading-4 text-muted">
          {message}
        </span>
      )}
    </div>
  );
}
