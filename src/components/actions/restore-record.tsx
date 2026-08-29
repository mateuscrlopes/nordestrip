"use client";

import { createClient } from "@/lib/supabase/client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RestorableTable =
  | "pending_items"
  | "reservations"
  | "itinerary_items"
  | "accommodations"
  | "transport_segments"
  | "expenses"
  | "documents"
  | "places"
  | "stops";

export function RestoreRecord({
  table,
  id,
  label,
}: {
  table: RestorableTable;
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    if (!window.confirm(`Restaurar “${label}” para a viagem ativa?`)) return;

    setRestoring(true);
    setError("");
    const supabase = createClient();
    const { error: restoreError } = await supabase
      .from(table)
      .update({ archived_at: null })
      .eq("id", id);

    if (restoreError) {
      setError("Não foi possível restaurar.");
      setRestoring(false);
      return;
    }

    setRestoring(false);
    router.refresh();
  }

  return (
    <div className="restore-record">
      <button type="button" onClick={restore} disabled={restoring}>
        <RotateCcw size={14} />
        {restoring ? "Restaurando..." : "Restaurar"}
      </button>
      {error && <span role="status">{error}</span>}
    </div>
  );
}
