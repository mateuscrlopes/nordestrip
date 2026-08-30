"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PluggySuccessData = {
  id?: string;
  item?: {
    id?: string;
  };
};

type PluggyConnectConfig = {
  connectToken: string;
  includeSandbox?: boolean;
  updateItem?: string;
  language?: string;
  onSuccess?: (data: PluggySuccessData) => void | Promise<void>;
  onError?: () => void | Promise<void>;
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

export function PluggyConnectButton({
  tripId,
  itemId,
  status,
}: {
  tripId: string;
  itemId?: string | null;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  async function open() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/pluggy/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, itemId: itemId || null }),
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
        includeSandbox?: unknown;
      };

      if (typeof data.accessToken !== "string" || !data.accessToken) {
        throw new Error("Token de conexão inválido.");
      }

      await loadPluggyConnect();
      if (!window.PluggyConnect) {
        throw new Error("Não foi possível carregar a conexão financeira.");
      }

      const widget = new window.PluggyConnect({
        connectToken: data.accessToken,
        includeSandbox: data.includeSandbox === true,
        ...(itemId ? { updateItem: itemId } : {}),
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
        onError: () => {
          setMessage("Não foi possível concluir a conexão financeira.");
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

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={open}
        className="inline-flex min-h-9 items-center justify-center rounded-xl bg-petrol px-3 text-[11px] font-semibold text-white transition hover:bg-[#0d303a] disabled:opacity-55"
      >
        {busy
          ? "Aguarde..."
          : itemId || status === "connected"
            ? "Atualizar conexão"
            : "Conectar conta"}
      </button>
      {message && (
        <span role="status" className="mt-2 block text-[10px] leading-4 text-muted">
          {message}
        </span>
      )}
    </div>
  );
}
