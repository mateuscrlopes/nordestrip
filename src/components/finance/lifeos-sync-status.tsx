"use client";

import { createClient } from "@/lib/supabase/client";
import { Check, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncStatus = "pending" | "dispatched" | "sent" | "error" | "conflict" | "ignored";

export function LifeOsSyncStatus({
  expenseId,
  status,
  lastError,
}: {
  expenseId: string;
  status: SyncStatus | null;
  lastError?: string | null;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");

  if (!status || status === "ignored") return null;

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("retry_lifeos_expense_sync", {
      p_expense_id: expenseId,
    });

    if (error) {
      setMessage("Não foi possível reenviar agora.");
      setRetrying(false);
      return;
    }

    setMessage("Reenvio agendado.");
    setRetrying(false);
    router.refresh();
  }

  if (status === "sent") {
    return (
      <span className="lifeos-sync-badge is-sent">
        <Check size={11} />
        No LifeOS
      </span>
    );
  }

  if (status === "conflict") {
    return (
      <span
        className="lifeos-sync-badge is-warning"
        title={lastError || "O LifeOS possui histórico de pagamento e precisa ser conferido."}
      >
        <TriangleAlert size={11} />
        Revisar no LifeOS
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="lifeos-sync-line">
        <span className="lifeos-sync-badge is-error" title={lastError || undefined}>
          <TriangleAlert size={11} />
          Falha no LifeOS
        </span>
        <button type="button" disabled={retrying} onClick={retry}>
          <RefreshCw size={11} className={retrying ? "spin" : ""} />
          {retrying ? "Reenviando..." : "Tentar novamente"}
        </button>
        {message && <small>{message}</small>}
      </span>
    );
  }

  return (
    <span className="lifeos-sync-badge is-pending">
      <RefreshCw size={11} className={status === "dispatched" ? "spin" : ""} />
      Sincronizando com LifeOS
    </span>
  );
}
