"use client";

import type { BudgetPocket } from "@/components/finance/budget-pockets-editor";
import { createClient } from "@/lib/supabase/client";
import { UserRound, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Member = {
  id: string;
  name: string;
};

export function TripFundTransactionActions({
  transactionId,
  amount,
  direction,
  pockets,
  members,
}: {
  transactionId: string;
  amount: number;
  direction: string | null;
  pockets: BudgetPocket[];
  members: Member[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState(false);
  const [message, setMessage] = useState("");
  const personPockets = useMemo(
    () => pockets.filter((pocket) => pocket.kind === "person" && pocket.linkedUserId),
    [pockets]
  );
  const total = Math.abs(amount);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(personPockets.map((pocket) => [pocket.id, 0]))
  );

  async function allocate(entries: { pocket_id: string; amount: number }[]) {
    if (saving || !entries.length) return;
    const sum = entries.reduce((acc, item) => acc + item.amount, 0);
    if (Math.abs(sum - total) > 0.01) {
      setMessage("A divisão precisa fechar o valor inteiro da transação.");
      return;
    }

    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("review_trip_fund_transaction", {
      p_transaction_id: transactionId,
      p_allocations: entries,
      p_custom_description: null,
    });

    if (error) {
      setMessage("Não foi possível classificar esta movimentação.");
      setSaving(false);
      return;
    }

    setCustom(false);
    setSaving(false);
    router.refresh();
  }

  async function assignContribution(userId: string) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("assign_trip_fund_contribution", {
      p_transaction_id: transactionId,
      p_user_id: userId,
    });

    if (error) {
      setMessage("Não foi possível atribuir este aporte.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  if (direction === "credit") {
    return (
      <div className="fund-transaction-actions">
        <span>Quem fez este aporte?</span>
        <div className="fund-transaction-buttons">
          {members.map((member) => (
            <button
              type="button"
              disabled={saving}
              key={member.id}
              onClick={() => assignContribution(member.id)}
            >
              <UserRound size={13} />
              {member.name}
            </button>
          ))}
        </div>
        {message && <small role="status">{message}</small>}
      </div>
    );
  }

  function half() {
    if (personPockets.length !== 2) {
      setCustom(true);
      return;
    }
    const first = Math.round((total / 2) * 100) / 100;
    allocate([
      { pocket_id: personPockets[0].id, amount: first },
      { pocket_id: personPockets[1].id, amount: Math.round((total - first) * 100) / 100 },
    ]);
  }

  return (
    <>
      <div className="fund-transaction-actions">
        <span>De quem foi este gasto?</span>
        <div className="fund-transaction-buttons">
          <button type="button" disabled={saving} onClick={half}>
            <UsersRound size={13} />
            50% cada
          </button>
          {personPockets.map((pocket) => (
            <button
              type="button"
              disabled={saving}
              key={pocket.id}
              onClick={() => allocate([{ pocket_id: pocket.id, amount: total }])}
            >
              <UserRound size={13} />
              {pocket.label}
            </button>
          ))}
          <button type="button" disabled={saving} onClick={() => setCustom(true)}>
            Dividir valores
          </button>
        </div>
        {message && <small role="status">{message}</small>}
      </div>

      {custom && (
        <div className="edit-overlay" onClick={() => !saving && setCustom(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Fundo da viagem</p>
                <h2>Dividir {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</h2>
              </div>
              <button
                type="button"
                className="add-icon-button"
                aria-label="Fechar"
                disabled={saving}
                onClick={() => setCustom(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="fund-custom-split">
              {personPockets.map((pocket) => (
                <label className="add-field" key={pocket.id}>
                  <span>{pocket.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={total}
                    step="0.01"
                    inputMode="decimal"
                    value={values[pocket.id] ?? 0}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [pocket.id]: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <p className="fund-custom-total">
              Total dividido:{" "}
              {Object.values(values)
                .reduce((sum, value) => sum + value, 0)
                .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>

            {message && <p className="add-error" role="status">{message}</p>}

            <div className="add-form-actions">
              <button type="button" className="add-secondary" disabled={saving} onClick={() => setCustom(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="add-primary"
                disabled={saving}
                onClick={() =>
                  allocate(
                    personPockets
                      .map((pocket) => ({
                        pocket_id: pocket.id,
                        amount: Math.round((values[pocket.id] ?? 0) * 100) / 100,
                      }))
                      .filter((entry) => entry.amount > 0)
                  )
                }
              >
                {saving ? "Salvando..." : "Confirmar divisão"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
