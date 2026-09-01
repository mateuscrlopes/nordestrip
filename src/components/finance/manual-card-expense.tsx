"use client";

import { createClient } from "@/lib/supabase/client";
import { CreditCard, Plus, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  id: string;
  name: string;
};

export function ManualCardExpense({
  tripId,
  members,
}: {
  tripId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);
  const [shares, setShares] = useState<Record<string, number>>(
    Object.fromEntries(members.map((member) => [member.id, 0]))
  );

  const divided = useMemo(
    () => Object.values(shares).reduce((sum, value) => sum + value, 0),
    [shares]
  );

  function equalSplit(nextTotal = total) {
    if (!members.length) return;
    const cents = Math.round(Math.max(0, nextTotal) * 100);
    const base = Math.floor(cents / members.length);
    let remaining = cents - base * members.length;
    const next: Record<string, number> = {};

    members.forEach((member) => {
      const extra = remaining > 0 ? 1 : 0;
      remaining -= extra;
      next[member.id] = (base + extra) / 100;
    });

    setShares(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const installments = Math.max(1, Number(form.get("installments")) || 1);

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor válido.");
      return;
    }

    if (Math.abs(divided - amount) > 0.01) {
      setMessage("A divisão entre vocês precisa fechar o valor total.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("create_manual_card_expense", {
      p_trip_id: tripId,
      p_title: String(form.get("title") || "").trim(),
      p_amount: amount,
      p_payer_user_id: String(form.get("payer")),
      p_splits: members.map((member) => ({
        user_id: member.id,
        amount: Math.round((shares[member.id] ?? 0) * 100) / 100,
      })),
      p_installments: installments,
      p_first_due: String(form.get("firstDue")),
      p_occurred_at: new Date().toISOString(),
      p_stop_id: null,
      p_category_id: null,
      p_notes: String(form.get("notes") || "").trim() || null,
    });

    if (error) {
      setMessage("Não foi possível registrar esta compra.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    setTotal(0);
    setShares(Object.fromEntries(members.map((member) => [member.id, 0])));
    router.refresh();
  }

  return (
    <>
      <button type="button" className="personal-card-add" onClick={() => setOpen(true)}>
        <Plus size={14} />
        Registrar compra no cartão
      </button>

      {open && (
        <div className="edit-overlay" onClick={() => !saving && setOpen(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Cartão pessoal</p>
                <h2>Nova compra da viagem</h2>
              </div>
              <button
                type="button"
                className="add-icon-button"
                aria-label="Fechar"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <form className="add-form" onSubmit={submit}>
              <label className="add-field">
                <span>Descrição</span>
                <input name="title" required placeholder="Ex.: Hospedagem em Natal" />
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Valor total</span>
                  <input
                    name="amount"
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={total || ""}
                    onChange={(event) => {
                      const next = Math.max(0, Number(event.target.value) || 0);
                      setTotal(next);
                      equalSplit(next);
                    }}
                  />
                </label>
                <label className="add-field">
                  <span>Pago por</span>
                  <select name="payer" required defaultValue={members[0]?.id}>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="manual-card-split">
                <div>
                  <strong>Divisão</strong>
                  <button type="button" onClick={() => equalSplit()}>50% cada</button>
                </div>
                <div className="add-grid">
                  {members.map((member) => (
                    <label className="add-field" key={member.id}>
                      <span>{member.name}</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={shares[member.id] ?? 0}
                        onChange={(event) =>
                          setShares((current) => ({
                            ...current,
                            [member.id]: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <small>
                  Dividido: {divided.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </small>
              </div>

              <div className="add-grid">
                <label className="add-field">
                  <span>Parcelas</span>
                  <input name="installments" type="number" min={1} max={60} defaultValue={1} required />
                </label>
                <label className="add-field">
                  <span>Vencimento da 1ª</span>
                  <input
                    name="firstDue"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
              </div>

              <label className="add-field">
                <span>Observação</span>
                <textarea name="notes" placeholder="Opcional" />
              </label>

              <div className="manual-card-note">
                <CreditCard size={16} />
                <p>
                  O custo entra na viagem agora. As parcelas aparecem separadamente em
                  “Ainda passará pelas faturas” e não reduzem o Fundo do Mercado Pago.
                </p>
              </div>

              {message && <p className="add-error" role="status">{message}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" disabled={saving} onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="add-primary" disabled={saving || !members.length}>
                  {saving ? "Salvando..." : "Registrar compra"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
