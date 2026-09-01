"use client";

import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PersonalCardCommitmentActions({
  expenseId,
  title,
}: {
  expenseId: string;
  title: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function remove() {
    const confirmed = window.confirm(
      `Remover “${title}” de “Ainda passará pelas faturas”?\n\nA compra será arquivada e todas as parcelas futuras ligadas a ela sairão desta lista. O histórico não será apagado.`
    );

    if (!confirmed) return;

    setRemoving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("expenses")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", expenseId);

    if (error) {
      window.alert("Não foi possível remover esta compra da lista.");
      setRemoving(false);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      className="personal-commitment-remove"
      aria-label={`Remover ${title} da lista`}
      title="Remover da lista"
      disabled={removing}
      onClick={remove}
    >
      <Trash2 size={14} />
    </button>
  );
}
