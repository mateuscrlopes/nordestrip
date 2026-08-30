"use client";

import type { BudgetPocket } from "@/components/finance/budget-pockets-editor";
import { createClient } from "@/lib/supabase/client";
import { Ban, Pencil, UserRound, UsersRound, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function TransactionReviewActions({
  id,
  reviewStatus,
  customDescription,
  originalDescription,
  direction,
  pockets = [],
}: {
  id: string;
  reviewStatus: string;
  customDescription?: string | null;
  originalDescription?: string | null;
  direction?: string | null;
  pockets?: BudgetPocket[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [choosingPerson, setChoosingPerson] = useState(false);
  const [description, setDescription] = useState(customDescription || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sharedPocket = pockets.find((pocket) => pocket.kind === "shared") ?? null;
  const people = pockets.filter((pocket) => pocket.kind === "person");

  async function review(
    nextStatus: "trip" | "not_trip" | "later",
    nextDescription?: string | null,
    pocketId?: string | null
  ) {
    if (saving) return false;

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("review_financial_transaction", {
      p_transaction_id: id,
      p_review_status: nextStatus,
      p_custom_description: nextDescription === undefined ? null : nextDescription,
      p_pocket_id: pocketId ?? null,
    });

    if (updateError) {
      setError(
        updateError.message.includes("credit-transaction")
          ? "Entradas ainda não podem virar gasto."
          : "Não foi possível atualizar esta transação."
      );
      setSaving(false);
      return false;
    }

    setSaving(false);
    setChoosingPerson(false);
    router.refresh();
    return true;
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await review(
      reviewStatus === "trip" || reviewStatus === "not_trip" ? reviewStatus : "later",
      description
    );
    if (saved) setEditing(false);
  }

  return (
    <>
      {reviewStatus === "later" && direction !== "credit" ? (
        <div className="transaction-classify-actions">
          <button
            type="button"
            className="transaction-classify-button"
            disabled={saving || !sharedPocket}
            onClick={() => sharedPocket && review("trip", undefined, sharedPocket.id)}
          >
            <UsersRound size={15} />
            Compartilhado
          </button>
          <button
            type="button"
            className="transaction-classify-button"
            disabled={saving || people.length === 0}
            onClick={() => setChoosingPerson(true)}
          >
            <UserRound size={15} />
            Uma pessoa
          </button>
          <div className="transaction-secondary-actions">
            <button
              type="button"
              aria-label="Renomear no Nordestrip"
              title="Renomear"
              disabled={saving}
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label="Não é da viagem"
              title="Não é da viagem"
              disabled={saving}
              onClick={() => review("not_trip")}
            >
              <Ban size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="transaction-secondary-actions">
          <button
            type="button"
            aria-label="Renomear no Nordestrip"
            title="Renomear"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
          {reviewStatus !== "not_trip" && (
            <button
              type="button"
              aria-label="Não é da viagem"
              title="Não é da viagem"
              disabled={saving}
              onClick={() => review("not_trip")}
            >
              <Ban size={13} />
            </button>
          )}
        </div>
      )}

      {choosingPerson && (
        <div className="edit-overlay" onClick={() => !saving && setChoosingPerson(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Gasto individual</p>
                <h2>De quem foi esta compra?</h2>
              </div>
              <button
                type="button"
                className="add-icon-button"
                aria-label="Fechar"
                disabled={saving}
                onClick={() => setChoosingPerson(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="person-pocket-list">
              {people.map((pocket) => (
                <button
                  key={pocket.id}
                  type="button"
                  disabled={saving}
                  onClick={() => review("trip", undefined, pocket.id)}
                >
                  <span className="budget-pocket-icon"><UserRound size={17} /></span>
                  <span>
                    <strong>{pocket.label}</strong>
                    <small>{pocket.availableAmount > 0 ? `${pocket.availableAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} disponível` : "Orçamento ainda não definido"}</small>
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="add-error mt-3" role="alert">{error}</p>}
          </section>
        </div>
      )}

      {editing && (
        <div className="edit-overlay" onClick={() => !saving && setEditing(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Transação</p>
                <h2>Nome no Nordestrip</h2>
              </div>
              <button
                type="button"
                className="add-icon-button"
                aria-label="Fechar"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveName} className="add-form">
              <label className="add-field">
                <span>Descrição</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={originalDescription || "Descrição da transação"}
                />
              </label>

              {originalDescription && (
                <p className="rounded-xl bg-sand/45 px-3 py-2 text-[10px] leading-4 text-muted">
                  Original: {originalDescription}
                </p>
              )}

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" disabled={saving} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar nome"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {direction === "credit" && reviewStatus === "later" && (
        <span className="text-[9px] text-muted">Entrada recebida; não entra como gasto.</span>
      )}
      {error && !editing && !choosingPerson && <span className="sr-only" role="status">{error}</span>}
    </>
  );
}
