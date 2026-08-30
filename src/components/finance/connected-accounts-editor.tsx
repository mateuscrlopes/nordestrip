"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { CreditCard, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ConnectedFinancialAccount = {
  id: string;
  displayName: string;
  accountType: string;
  balance: number | null;
  creditLimit: number | null;
  allocatedCreditLimit: number;
  lastSyncedAt: string | null;
  active: boolean;
  fundEnabled: boolean;
  pluggyItemId: string | null;
};

function isCard(account: ConnectedFinancialAccount) {
  return account.accountType === "credit_card";
}

function accountKind(account: ConnectedFinancialAccount) {
  return isCard(account) ? "Cartão de crédito" : "Conta";
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
  const [limits, setLimits] = useState<Record<string, number>>(
    Object.fromEntries(accounts.map((account) => [account.id, account.allocatedCreditLimit]))
  );

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.fundEnabled !== b.fundEnabled) return a.fundEnabled ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, "pt-BR");
    }),
    [accounts]
  );

  const activeItemIds = useMemo(
    () => Array.from(new Set(
      accounts
        .filter((account) => account.active && account.pluggyItemId)
        .map((account) => account.pluggyItemId as string)
    )),
    [accounts]
  );

  async function syncActiveTransactions() {
    if (!activeItemIds.length || savingId) return;

    setSavingId("__sync__");
    setMessage("");

    try {
      let total = 0;

      for (const itemId of activeItemIds) {
        const response = await fetch("/api/integrations/pluggy/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, itemId }),
        });

        if (!response.ok) {
          throw new Error("sync-failed");
        }

        const body = await response.json() as { transactionsSynced?: unknown };
        if (typeof body.transactionsSynced === "number") {
          total += body.transactionsSynced;
        }
      }

      setMessage(
        total === 1
          ? "1 transação sincronizada para revisão."
          : `${total} transações sincronizadas para revisão.`
      );
      router.refresh();
    } catch {
      setMessage("Não foi possível sincronizar as transações agora.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleUsage(account: ConnectedFinancialAccount) {
    setSavingId(account.id);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("set_trip_financial_account_usage", {
      p_trip_id: tripId,
      p_financial_account_id: account.id,
      p_enabled: !account.active,
    });

    if (error) {
      setMessage("Não foi possível atualizar o uso desta conta na viagem.");
      setSavingId(null);
      return;
    }

    setMessage(
      account.active
        ? "Conta removida da viagem. A conexão com a Pluggy foi preservada."
        : "Conta adicionada à viagem."
    );
    setSavingId(null);
    router.refresh();
  }

  async function toggleFund(account: ConnectedFinancialAccount) {
    if (isCard(account) || !account.active) return;

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

  async function saveCardLimit(account: ConnectedFinancialAccount) {
    if (!isCard(account) || !account.active) return;
    const value = limits[account.id] ?? 0;

    setSavingId(account.id);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("set_trip_card_limit", {
      p_trip_id: tripId,
      p_financial_account_id: account.id,
      p_allocated_limit: value,
    });

    if (error) {
      setMessage(
        error.message.includes("superar")
          ? "O limite da viagem não pode ser maior que o limite do cartão."
          : "Não foi possível salvar o limite reservado para a viagem."
      );
      setSavingId(null);
      return;
    }

    setMessage(`Limite de ${formatMoney(value)} reservado para a viagem.`);
    setSavingId(null);
    router.refresh();
  }

  return (
    <section>
      <div className="section-heading">
        <h2>Contas e cartões</h2>
        <button
          type="button"
          onClick={syncActiveTransactions}
          disabled={!activeItemIds.length || savingId !== null}
          className="rounded-xl bg-pale-blue/60 px-2.5 py-2 text-[10px] font-semibold text-petrol disabled:opacity-40"
        >
          {savingId === "__sync__" ? "Sincronizando..." : "Sincronizar"}
        </button>
      </div>

      <div className="space-y-2">
        {sortedAccounts.map((account) => {
          const card = isCard(account);
          const Icon = card ? CreditCard : Landmark;
          const max = Math.max(0, account.creditLimit ?? 0);
          const currentLimit = Math.min(
            max || Number.MAX_SAFE_INTEGER,
            Math.max(0, limits[account.id] ?? 0)
          );

          return (
            <article
              key={account.id}
              className={`rounded-[22px] border border-petrol/8 bg-surface/72 p-4 ${
                account.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="settings-row-icon"><Icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold">{account.displayName}</p>
                    {account.fundEnabled && (
                      <span className="rounded-full bg-pale-blue/60 px-2 py-0.5 text-[9px] font-semibold text-petrol">
                        Fundo da viagem
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 block text-[10px] font-medium text-petrol/55">
                    {accountKind(account)}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted">
                    {card
                      ? account.balance == null
                        ? "Fatura ainda não informada"
                        : `Fatura aberta ${formatMoney(account.balance)}`
                      : account.balance == null
                        ? "Saldo ainda não informado"
                        : `Saldo ${formatMoney(account.balance)}`}
                  </span>
                  {card && account.creditLimit != null && (
                    <span className="mt-0.5 block text-[10px] text-muted">
                      Limite total {formatMoney(account.creditLimit)}
                    </span>
                  )}
                  {account.lastSyncedAt && (
                    <span className="mt-0.5 block text-[9px] text-muted">
                      Atualizada {formatDateTime(account.lastSyncedAt)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={savingId === account.id}
                  onClick={() => toggleUsage(account)}
                  className={`shrink-0 rounded-xl px-2.5 py-2 text-[10px] font-semibold disabled:opacity-55 ${
                    account.active ? "bg-sand/55 text-petrol" : "bg-pale-blue/65 text-petrol"
                  }`}
                >
                  {savingId === account.id
                    ? "Salvando..."
                    : account.active
                      ? "Não usar"
                      : "Usar na viagem"}
                </button>
              </div>

              {account.active && !card && (
                <div className="mt-3 border-t border-petrol/8 pt-3">
                  <button
                    type="button"
                    disabled={savingId === account.id}
                    onClick={() => toggleFund(account)}
                    className="rounded-xl bg-pale-blue/55 px-2.5 py-2 text-[10px] font-semibold text-petrol disabled:opacity-55"
                  >
                    {account.fundEnabled ? "Remover como fundo" : "Usar como fundo"}
                  </button>
                </div>
              )}

              {account.active && card && account.creditLimit != null && (
                <div className="mt-4 border-t border-petrol/8 pt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-petrol">Limite para a viagem</p>
                      <p className="mt-1 text-[15px] font-semibold tracking-[-.02em]">
                        {formatMoney(currentLimit)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingId === account.id || currentLimit === account.allocatedCreditLimit}
                      onClick={() => saveCardLimit(account)}
                      className="rounded-xl bg-petrol px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-35"
                    >
                      {savingId === account.id ? "Salvando..." : "Salvar limite"}
                    </button>
                  </div>

                  <input
                    className="mt-3 w-full accent-current"
                    type="range"
                    min={0}
                    max={max}
                    step={Math.max(1, Math.round(max / 100))}
                    value={currentLimit}
                    aria-label={`Limite de ${account.displayName} para a viagem`}
                    onChange={(event) =>
                      setLimits((current) => ({
                        ...current,
                        [account.id]: Number(event.target.value),
                      }))
                    }
                  />

                  <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3">
                    <label className="add-field">
                      <span>Valor exato</span>
                      <input
                        type="number"
                        min={0}
                        max={max}
                        step="0.01"
                        value={currentLimit}
                        onChange={(event) => {
                          const value = Math.min(max, Math.max(0, Number(event.target.value) || 0));
                          setLimits((current) => ({ ...current, [account.id]: value }));
                        }}
                      />
                    </label>
                    <span className="pb-2 text-[9px] text-muted">máx. {formatMoney(max)}</span>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-4 text-muted">
        Escolha primeiro as fontes da viagem e depois sincronize. Desativar uma conta aqui não remove o Item do Meu Pluggy.
      </p>
      {message && <p role="status" className="mt-2 text-[10px] leading-4 text-muted">{message}</p>}
    </section>
  );
}
