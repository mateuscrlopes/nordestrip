"use client";

import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils/format";
import { UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type BudgetPocket = {
  id: string;
  label: string;
  kind: "shared" | "person";
  allocatedAmount: number;
  spentAmount: number;
  availableAmount: number;
  sortOrder: number;
  linkedUserId?: string | null;
};

export function BudgetPocketsEditor({ pockets }: { pockets: BudgetPocket[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(pockets.map((pocket) => [pocket.id, pocket.allocatedAmount]))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const total = useMemo(
    () => pockets.reduce((sum, pocket) => sum + (values[pocket.id] ?? 0), 0),
    [pockets, values]
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const supabase = createClient();

    for (const pocket of pockets) {
      const next = Math.max(0, Number(values[pocket.id]) || 0);
      if (next === pocket.allocatedAmount) continue;

      const { error } = await supabase
        .from("trip_budget_pockets")
        .update({ allocated_amount: next, updated_at: new Date().toISOString() })
        .eq("id", pocket.id);

      if (error) {
        setMessage("Não foi possível salvar a divisão do orçamento.");
        setSaving(false);
        return;
      }
    }

    setMessage("Orçamento atualizado.");
    setSaving(false);
    router.refresh();
  }

  return (
    <section className="budget-pockets-panel">
      <div className="section-heading">
        <div>
          <h2>Orçamento da viagem</h2>
          <p className="mt-1 text-[10px] leading-4 text-muted">
            O dinheiro pode ficar na mesma conta; aqui vocês separam o que é conjunto e o que é de cada um.
          </p>
        </div>
      </div>

      <div className="budget-pockets-total">
        <span>Total planejado</span>
        <strong>{formatMoney(total)}</strong>
      </div>

      <div className="budget-pockets-list">
        {pockets.map((pocket) => {
          const Icon = pocket.kind === "shared" ? UsersRound : UserRound;
          return (
            <label key={pocket.id} className="budget-pocket-row">
              <span className="budget-pocket-icon"><Icon size={17} /></span>
              <span className="min-w-0 flex-1">
                <strong>{pocket.label}</strong>
                <small>
                  {pocket.spentAmount > 0
                    ? `${formatMoney(pocket.spentAmount)} já usado · ${formatMoney(pocket.availableAmount)} restante`
                    : pocket.kind === "shared" ? "Gastos dos dois" : "Gastos individuais"}
                </small>
              </span>
              <span className="budget-pocket-input-wrap">
                <span>R$</span>
                <input
                  aria-label={`Orçamento de ${pocket.label}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={values[pocket.id] ?? 0}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [pocket.id]: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        className="budget-pockets-save"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Salvando..." : "Salvar divisão"}
      </button>
      {message && <p className="mt-2 text-[10px] text-muted" role="status">{message}</p>}
    </section>
  );
}
