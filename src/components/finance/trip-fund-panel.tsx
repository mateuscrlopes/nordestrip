"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { ArrowDownToLine, RefreshCw, Wallet, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; name: string };
type Balance = {
  userId: string;
  name: string;
  contributedAmount: number;
  spentAmount: number;
  availableAmount: number;
};

type FundAccount = {
  id: string;
  displayName: string;
  balance: number | null;
  lastSyncedAt: string | null;
  pluggyItemId: string | null;
} | null;

export function TripFundPanel({
  tripId,
  account,
  balances,
  members,
}: {
  tripId: string;
  account: FundAccount;
  balances: Balance[];
  members: Member[];
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    if (!account?.pluggyItemId || syncing) return;
    setSyncing(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/pluggy/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, itemId: account.pluggyItemId }),
      });

      if (!response.ok) throw new Error("sync-failed");

      const supabase = createClient();
      const reconciliation = await supabase.rpc("reconcile_pending_trip_fund_contributions", {
        p_trip_id: tripId,
      });

      if (reconciliation.error) {
        setMessage("Mercado Pago atualizado. Alguns aportes ainda precisam ser conciliados.");
      } else {
        const matched = Number(reconciliation.data || 0);
        setMessage(
          matched
            ? `Mercado Pago atualizado e ${matched} aporte(s) conciliado(s).`
            : "Mercado Pago atualizado."
        );
      }
      router.refresh();
    } catch {
      setMessage("Não foi possível atualizar o Mercado Pago agora.");
    } finally {
      setSyncing(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    setUploading(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    form.set("tripId", tripId);

    try {
      const response = await fetch("/api/finance/fund-contribution", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar o aporte.");

      setShowUpload(false);
      setMessage(
        body.matched
          ? "Aporte encontrado no Mercado Pago e atribuído."
          : body.message || "Comprovante guardado para conciliação."
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registrar o aporte.");
    } finally {
      setUploading(false);
    }
  }

  const realBalance = account?.balance ?? 0;
  const allocated = balances.reduce((sum, item) => sum + item.availableAmount, 0);
  const unassigned = realBalance - allocated;

  return (
    <section className="trip-fund-panel">
      <div className="trip-fund-heading">
        <div>
          <p>Fundo da viagem</p>
          <h2>{account ? formatMoney(realBalance) : "Fundo não conectado"}</h2>
          <span>
            {account
              ? `${account.displayName}${account.lastSyncedAt ? ` · atualizada ${formatDateTime(account.lastSyncedAt)}` : ""}`
              : "Conecte a conta Mercado Pago usada exclusivamente para a viagem."}
          </span>
        </div>
        <span className="trip-fund-icon"><Wallet size={20} /></span>
      </div>

      <div className="trip-fund-balances">
        {balances.map((balance) => (
          <div key={balance.userId}>
            <span>{balance.name.split(".")[0]}</span>
            <strong>{formatMoney(balance.availableAmount)}</strong>
            <small>
              {formatMoney(balance.contributedAmount)} aportados · {formatMoney(balance.spentAmount)} usados
            </small>
          </div>
        ))}
      </div>

      {Math.abs(unassigned) > 0.01 && (
        <p className="trip-fund-reconciliation">
          {unassigned > 0
            ? `${formatMoney(unassigned)} do saldo real ainda não estão atribuídos a uma pessoa.`
            : `Os saldos virtuais estão ${formatMoney(Math.abs(unassigned))} acima do saldo real; vale revisar estornos ou aportes.`}
        </p>
      )}

      <div className="trip-fund-actions">
        <button type="button" disabled={!account?.pluggyItemId || syncing} onClick={sync}>
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "Atualizando..." : "Atualizar Mercado Pago"}
        </button>
        <button type="button" onClick={() => setShowUpload(true)}>
          <ArrowDownToLine size={14} />
          Informar aporte
        </button>
      </div>

      {message && <p className="trip-fund-message" role="status">{message}</p>}

      {showUpload && (
        <div className="edit-overlay" onClick={() => !uploading && setShowUpload(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Fundo da viagem</p>
                <h2>Enviar comprovante de aporte</h2>
              </div>
              <button
                type="button"
                className="add-icon-button"
                aria-label="Fechar"
                disabled={uploading}
                onClick={() => setShowUpload(false)}
              >
                <X size={19} />
              </button>
            </div>

            <form className="add-form" onSubmit={upload}>
              <label className="add-field">
                <span>Quem colocou esse dinheiro?</span>
                <select name="contributorUserId" required defaultValue={members[0]?.id}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </label>

              <label className="add-field">
                <span>Comprovante</span>
                <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required />
              </label>

              <label className="add-field">
                <span>Valor, se o arquivo não tiver texto legível</span>
                <input name="amount" type="number" min={0.01} step="0.01" placeholder="Opcional para PDF legível" />
              </label>

              <p className="fund-proof-note">
                O Nordestrip tenta ler valor e data do PDF sem IA e procura a entrada correspondente no Mercado Pago.
                O comprovante nunca soma dinheiro duas vezes: ele apenas identifica de quem foi a entrada bancária.
              </p>

              <div className="add-form-actions">
                <button type="button" className="add-secondary" disabled={uploading} onClick={() => setShowUpload(false)}>
                  Cancelar
                </button>
                <button type="submit" className="add-primary" disabled={uploading || !members.length}>
                  {uploading ? "Enviando..." : "Enviar comprovante"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
