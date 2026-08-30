"use client";

import { Route } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RouteGeographyControl({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/maps/route-estimates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });

      if (response.status === 401) {
        const next = window.location.pathname + window.location.search;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const body = await response.json() as { error?: unknown; message?: unknown; calculated?: unknown };
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Não foi possível atualizar os trajetos.");
      }

      setMessage(typeof body.message === "string" ? body.message : "Geografia atualizada.");
      if (typeof body.calculated === "number" && body.calculated > 0) {
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os trajetos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-[18px] bg-surface/70 px-4 py-3">
      <div className="min-w-0">
        <strong className="block text-[12px] text-petrol">Geografia do roteiro</strong>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted">
          Calcula somente trajetos a pé ainda sem estimativa.
        </span>
        {message && <span role="status" className="mt-1 block text-[10px] leading-4 text-muted">{message}</span>}
      </div>
      <button
        type="button"
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-pale-blue/60 px-3 text-[10px] font-semibold text-petrol disabled:opacity-50"
        disabled={busy}
        onClick={refresh}
      >
        <Route size={14} />
        {busy ? "Calculando..." : "Atualizar trajetos"}
      </button>
    </div>
  );
}
