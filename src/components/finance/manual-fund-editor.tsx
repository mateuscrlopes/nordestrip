"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { Pencil, Wallet, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ManualFund = {
  balance: number;
  enabled: boolean;
  lastSyncedAt?: string | null;
} | null;

export function ManualFundEditor({
  tripId,
  fund,
}: {
  tripId: string;
  fund: ManualFund;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("balance") || "").trim().replace(",", ".");
    const balance = Number(raw);

    if (!Number.isFinite(balance) || balance < 0) {
      setError("Informe um saldo válido, igual ou maior que zero.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: saveError } = await supabase.rpc("set_manual_trip_fund", {
      p_trip_id: tripId,
      p_balance: balance,
      p_enabled: form.get("enabled") === "on",
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <>
      <div className="manual-fund-row">
        <span className="manual-fund-icon"><Wallet size={17} /></span>
        <div className="min-w-0 flex-1">
          <strong>Saldo manual do fundo</strong>
          <span>
            {fund
              ? `${formatMoney(fund.balance)} · ${fund.enabled ? "incluído no disponível" : "fora do disponível"}`
              : "Use como alternativa enquanto nenhuma conta estiver conectada."}
          </span>
          {fund?.lastSyncedAt && <small>Atualizado {formatDateTime(fund.lastSyncedAt)}</small>}
        </div>
        <button type="button" onClick={() => { setEditing(true); setError(""); }}>
          <Pencil size={15} />
          {fund ? "Editar" : "Definir"}
        </button>
      </div>

      {editing && (
        <div className="edit-overlay" onClick={() => setEditing(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Dinheiro</p>
                <h2>Saldo manual do fundo</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setEditing(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={save} className="add-form">
              <label className="add-field">
                <span>Saldo atual</span>
                <input
                  name="balance"
                  inputMode="decimal"
                  required
                  defaultValue={fund?.balance ?? ""}
                  placeholder="0,00"
                />
              </label>

              <label className="add-check">
                <input name="enabled" type="checkbox" defaultChecked={fund?.enabled ?? true} />
                <span>Usar este saldo no cálculo de disponível para usar</span>
              </label>

              <p className="manual-fund-note">
                Este valor é um registro manual. Se uma conta conectada já representar o mesmo dinheiro, desative esta opção para não contar o saldo duas vezes.
              </p>

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar saldo"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
