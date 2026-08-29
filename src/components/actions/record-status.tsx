"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type TableName =
  | "pending_items"
  | "reservations"
  | "itinerary_items"
  | "accommodations"
  | "transport_segments"
  | "expenses";

type Option = { value: string; label: string };

export function RecordStatus({
  table,
  id,
  value,
  options,
  label = "Status",
  compact = false,
}: {
  table: TableName;
  id: string;
  value: string;
  options: Option[];
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function change(next: string) {
    if (!next || next === current || saving) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError("");

    const supabase = createClient();
    const payload: Record<string, unknown> = { status: next };

    if (table === "pending_items") {
      payload.resolved_at = next === "resolved" ? new Date().toISOString() : null;
    }

    const { error: updateError } = await supabase.from(table).update(payload).eq("id", id);

    if (updateError) {
      setCurrent(previous);
      setError("Não foi possível atualizar.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  return (
    <div className={compact ? "record-status record-status--compact" : "record-status"}>
      <label>
        <span className="sr-only">{label}</span>
        <select
          aria-label={label}
          value={current}
          disabled={saving}
          onChange={(event) => change(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {error && <span className="record-status-error" role="status">{error}</span>}
    </div>
  );
}

export const pendingStatusOptions: Option[] = [
  { value: "pending", label: "Pendente" },
  { value: "checking", label: "Em verificação" },
  { value: "resolved", label: "Resolvido" },
  { value: "cancelled", label: "Cancelado" },
];

export const reservationStatusOptions: Option[] = [
  { value: "estimated", label: "Estimado" },
  { value: "quoted", label: "Cotado" },
  { value: "reserved", label: "Reservado" },
  { value: "purchased", label: "Comprado" },
  { value: "paid", label: "Pago" },
  { value: "cancelled", label: "Cancelado" },
];

export const itineraryStatusOptions: Option[] = [
  { value: "idea", label: "Ideia" },
  { value: "planned", label: "Planejado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "done", label: "Feito" },
  { value: "cancelled", label: "Cancelado" },
];

export const accommodationStatusOptions: Option[] = [
  { value: "researching", label: "Pesquisando" },
  { value: "option", label: "Opção" },
  { value: "selected", label: "Selecionado" },
  { value: "reserved", label: "Reservado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

export const transportStatusOptions: Option[] = [
  { value: "idea", label: "Ideia" },
  { value: "planned", label: "Planejado" },
  { value: "quoted", label: "Cotado" },
  { value: "reserved", label: "Reservado" },
  { value: "purchased", label: "Comprado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

export const expenseStatusOptions: Option[] = [
  { value: "pending", label: "Pendente" },
  { value: "posted", label: "Lançado" },
  { value: "refunded", label: "Reembolsado" },
  { value: "partially_refunded", label: "Reembolso parcial" },
  { value: "cancelled", label: "Cancelado" },
];
