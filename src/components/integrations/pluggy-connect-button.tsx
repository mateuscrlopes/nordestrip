"use client";

import { RefreshCw, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PluggySuccessData = {
  item?: { id?: string };
  id?: string;
};

export function PluggyConnectButton({
  tripId,
  configured,
  itemId,
}: {
  tripId: string;
  configured: boolean;
  itemId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "opening" | "syncing" | "done">("idle");
  const [error, setError] = useState("");

  async function connect() {
    if (!configured || !tripId) return;

    setState("opening");
    setError("");

    try {
      const tokenResponse = await fetch("/api/integrations/pluggy/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, itemId }),
      });
      const tokenData = await tokenResponse.json() as { accessToken?: string; error?: string };
      if (!tokenResponse.ok || !tokenData.accessToken) {
        throw new Error(tokenData.error || "Não foi possível iniciar a conexão.");
      }

      const { default: PluggyConnect } = await import("pluggy-connect-sdk");
      const widget = new PluggyConnect({
        connectToken: tokenData.accessToken,
        includeSandbox: false,
        ...(itemId ? { updateItem: itemId } : {}),
        onSuccess: (data: PluggySuccessData) => {
          const connectedItemId = data.item?.id || data.id || itemId;
          if (!connectedItemId) {
            setState("idle");
            setError("A conexão terminou sem identificar a conta.");
            return;
          }

          setState("syncing");
          void fetch("/api/integrations/pluggy/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId, itemId: connectedItemId }),
          })
            .then(async (response) => {
              const result = await response.json() as { synced?: number; error?: string };
              if (!response.ok) throw new Error(result.error || "Não foi possível sincronizar as contas.");
              setState("done");
              router.refresh();
              window.setTimeout(() => setState("idle"), 1800);
            })
            .catch((syncError: unknown) => {
              setState("idle");
              setError(syncError instanceof Error ? syncError.message : "Não foi possível sincronizar as contas.");
            });
        },
        onError: () => {
          setState("idle");
          setError("A conexão com a instituição não foi concluída.");
        },
        onClose: () => {
          setState((current) => current === "opening" ? "idle" : current);
        },
      });

      widget.init();
    } catch (connectError) {
      setState("idle");
      setError(connectError instanceof Error ? connectError.message : "Não foi possível abrir a Pluggy.");
    }
  }

  if (!configured) {
    return (
      <span className="mt-2 block text-[11px] leading-4 text-muted">
        Credenciais da Pluggy ainda não configuradas.
      </span>
    );
  }

  const busy = state === "opening" || state === "syncing";

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={connect}
        className="inline-flex items-center gap-2 rounded-xl border border-petrol/12 bg-white/70 px-3 py-2 text-[12px] font-semibold text-petrol transition hover:bg-white disabled:opacity-60"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <WalletCards size={14} />}
        {state === "opening"
          ? "Abrindo..."
          : state === "syncing"
            ? "Sincronizando..."
            : state === "done"
              ? "Contas atualizadas"
              : itemId
                ? "Atualizar conexão"
                : "Conectar conta"}
      </button>
      {error && <p className="mt-2 text-[11px] leading-4 text-red-800">{error}</p>}
    </div>
  );
}
