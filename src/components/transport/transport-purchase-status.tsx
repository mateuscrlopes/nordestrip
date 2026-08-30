"use client";

import { createClient } from "@/lib/supabase/client";
import { Check, Clock3 } from "lucide-react";
import { useState } from "react";

function isPurchased(status: string) {
  return ["purchased", "confirmed", "completed"].includes(status);
}

export function TransportPurchaseStatus({
  id,
  value,
  label,
}: {
  id: string;
  value: string;
  label: string;
}) {
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(next: "planned" | "purchased") {
    if (saving || (next === "purchased") === isPurchased(current)) return;

    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("transport_segments")
      .update({ status: next })
      .eq("id", id);

    if (updateError) {
      setCurrent(previous);
      setError("Não foi possível atualizar.");
    }

    setSaving(false);
  }

  const purchased = isPurchased(current);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[10px] font-semibold ${!purchased ? "bg-sand/60 text-petrol" : "text-muted"}`}
        aria-pressed={!purchased}
        aria-label={`${label}: pendente`}
        disabled={saving}
        onClick={() => update("planned")}
      >
        <Clock3 size={13} />
        Pendente
      </button>
      <button
        type="button"
        className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[10px] font-semibold ${purchased ? "bg-pale-blue/70 text-petrol" : "text-muted"}`}
        aria-pressed={purchased}
        aria-label={`${label}: comprado`}
        disabled={saving}
        onClick={() => update("purchased")}
      >
        <Check size={13} />
        Comprado
      </button>
      {error && <span className="sr-only" role="status">{error}</span>}
    </div>
  );
}
