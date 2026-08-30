"use client";

import { createClient } from "@/lib/supabase/client";
import { BadgeCheck, Footprints } from "lucide-react";
import { useState } from "react";

export function ItineraryStatusActions({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirmed = current === "confirmed" || current === "done";
  const visited = current === "done";

  async function update(next: string) {
    if (saving || next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("itinerary_items")
      .update({ status: next })
      .eq("id", id);

    if (updateError) {
      setCurrent(previous);
      setError("Não foi possível atualizar.");
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`add-icon-button ${confirmed ? "bg-pale-blue/70 text-petrol" : ""}`}
        aria-label={confirmed ? `Remover confirmação de ${title}` : `Confirmar ${title}`}
        title={confirmed ? "Confirmado" : "Confirmar"}
        disabled={saving || visited}
        onClick={() => update(confirmed ? "planned" : "confirmed")}
      >
        <BadgeCheck size={15} />
      </button>
      <button
        type="button"
        className={`add-icon-button ${visited ? "bg-petrol text-white" : ""}`}
        aria-label={visited ? `Marcar ${title} como não visitado` : `Marcar ${title} como visitado`}
        title={visited ? "Visitado" : "Marcar como visitado"}
        disabled={saving}
        onClick={() => update(visited ? "confirmed" : "done")}
      >
        <Footprints size={15} />
      </button>
      {error && <span className="sr-only" role="status">{error}</span>}
    </div>
  );
}
