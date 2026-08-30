"use client";

import { createClient } from "@/lib/supabase/client";
import { Ban, Check, Pencil, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function TransactionReviewActions({
  id,
  reviewStatus,
  customDescription,
  originalDescription,
  direction,
}: {
  id: string;
  reviewStatus: string;
  customDescription?: string | null;
  originalDescription?: string | null;
  direction?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(customDescription || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function review(nextStatus: "trip" | "not_trip" | "later", nextDescription?: string | null) {
    if (saving) return false;

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("review_financial_transaction", {
      p_transaction_id: id,
      p_review_status: nextStatus,
      p_custom_description: nextDescription === undefined ? null : nextDescription,
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
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          className="add-icon-button"
          aria-label="Renomear no Nordestrip"
          title="Renomear no Nordestrip"
          disabled={saving}
          onClick={() => {
            setError("");
            setEditing(true);
          }}
        >
          <Pencil size={14} />
        </button>

        {reviewStatus === "later" && (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-pale-blue/65 px-2.5 text-[10px] font-semibold text-petrol disabled:opacity-40"
            disabled={saving || direction === "credit"}
            title={direction === "credit" ? "Entradas não são convertidas em gasto." : "Marcar como gasto da viagem"}
            onClick={() => review("trip")}
          >
            <Check size={13} />
            Da viagem
          </button>
        )}

        {reviewStatus !== "not_trip" && (
          <button
            type="button"
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[10px] font-semibold text-muted disabled:opacity-40"
            disabled={saving}
            onClick={() => review("not_trip")}
          >
            <Ban size={13} />
            Não é da viagem
          </button>
        )}
      </div>

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
                <button
                  type="button"
                  className="add-secondary"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
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

      {error && !editing && (
        <span className="sr-only" role="status">{error}</span>
      )}
    </>
  );
}
