"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { CreditCard, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ConnectedFinancialAccount = {
  id: string;
  displayName: string;
  accountType: string;
  balance: number | null;
  creditLimit: number | null;
  lastSyncedAt: string | null;
  fundEnabled: boolean;
};

function isCard(account: ConnectedFinancialAccount) {
  return account.accountType === "credit_card";
}

export function ConnectedAccountsEditor({
  tripId,
  accounts,
}: {
  tripId: string;
  accounts: ConnectedFinancialAccount[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function toggleFund(account: ConnectedFinancialAccount) {
    if (isCard(account)) return;

    setSavingId(account.id);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("set_trip_fund_source", {
      p_trip_id: tripId,
      p_financial_account_id: account.id,
      p_enabled: !account.fundEnabled,
    });

    if (error) {
      setMessage("Não foi possível atualizar o fundo da viagem.");
      setSavingId(null);
      return;
    }

    setMessage(
      account.fundEnabled
        ? "A conta saiu do cálculo de disponível."
        : "Conta definida como fundo. Outras fontes suas deixaram de entrar no disponível."
    );
    setSavingId(null);
    router.refresh();
  }

  return (
    <section>
      <div className="section-heading">
        <h2>Contas conectadas</h2>
      </div>

      <div className="divide-y divide-petrol/8 rounded-[22px] bg-surface/72 px-4">
        {accounts.map((account) => {
          const card = isCard(account);
          const Icon = card ? CreditCard : Landmark;

          return (
            <div key={account.id} className="flex min-h-[72px] items-center gap-3 py-3">
              <span className="settings-row-icon"><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{account.displayName}</p>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {card
                    ? account.balance == null
                      ? "Cartão conectado"
                      : `Fatura aberta ${formatMoney(account.balance)}`
                    : account.balance == null
                      ? "Saldo ainda não informado"
                      : `Saldo ${formatMoney(account.balance)}`}
                </span>
                {card && account.creditLimit != null && (
                  <span className="mt-0.5 block text-[10px] text-muted">
                    Limite {formatMoney(account.creditLimit)}
                  </span>
                )}
                {account.lastSyncedAt && (
                  <span className="mt-0.5 block text-[10px] text-muted">
                    Atualizada {formatDateTime(account.lastSyncedAt)}
                  </span>
                )}
                {account.fundEnabled && (
                  <span className="mt-1 inline-flex rounded-full bg-pale-blue/60 px-2 py-1 text-[9px] font-semibold text-petrol">
                    Usada no disponível
                  </span>
                )}
              </div>

              {!card && (
                <button
                  type="button"
                  disabled={savingId === account.id}
                  onClick={() => toggleFund(account)}
                  className="shrink-0 rounded-xl bg-pale-blue/55 px-2.5 py-2 text-[10px] font-semibold text-petrol disabled:opacity-55"
                >
                  {savingId === account.id
                    ? "Salvando..."
                    : account.fundEnabled
                      ? "Remover"
                      : "Usar como fundo"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-4 text-muted">
        Contas conectadas não entram no disponível automaticamente. Ao escolher uma conta como fundo, outras fontes suas deixam de ser somadas para evitar duplicidade.
      </p>
      {message && <p role="status" className="mt-2 text-[10px] leading-4 text-muted">{message}</p>}
    </section>
  );
}
