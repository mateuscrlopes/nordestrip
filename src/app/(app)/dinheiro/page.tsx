import { RecordActions } from "@/components/actions/record-actions";
import type { BudgetPocket } from "@/components/finance/budget-pockets-editor";
import { ManualCardExpense } from "@/components/finance/manual-card-expense";
import { TripFundPanel } from "@/components/finance/trip-fund-panel";
import { TripFundTransactionActions } from "@/components/finance/trip-fund-transaction-actions";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import {
  getTripExpenses,
  getTripFinanceSummary,
  getTripFinancialTransactions,
  getTripFundAccount,
  getTripFundPersonBalances,
  getTripMembersForFinance,
  getTripPersonalCardCommitments,
} from "@/lib/queries/trips";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { CreditCard, ReceiptText, ShieldCheck, Wallet } from "lucide-react";

async function getPersonPockets(tripId: string): Promise<BudgetPocket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_trip_budget_pockets")
    .select("id,label,kind,linked_user_id,allocated_amount,spent_amount,available_amount,sort_order")
    .eq("trip_id", tripId)
    .eq("kind", "person")
    .order("sort_order")
    .order("label");

  if (error) throw new Error(`Não foi possível carregar os bolsos pessoais: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind as "shared" | "person",
    allocatedAmount: Number(row.allocated_amount ?? 0),
    spentAmount: Number(row.spent_amount ?? 0),
    availableAmount: Number(row.available_amount ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    linkedUserId: row.linked_user_id ?? null,
  }));
}

function shortName(name: string | null | undefined) {
  return String(name || "Participante").split(".")[0];
}

export default async function MoneyPage() {
  const { trip } = await getCurrentTrip();

  const [finance, expenses, fundAccount, balances, transactions, members, commitments, pockets] = trip
    ? await Promise.all([
        getTripFinanceSummary(trip.id),
        getTripExpenses(trip.id, 12),
        getTripFundAccount(trip.id),
        getTripFundPersonBalances(trip.id),
        getTripFinancialTransactions(trip.id, 100),
        getTripMembersForFinance(trip.id),
        getTripPersonalCardCommitments(trip.id),
        getPersonPockets(trip.id),
      ])
    : [null, [], null, [], [], [], [], [] as BudgetPocket[]];

  const fundTransactions = fundAccount
    ? transactions.filter((transaction) => transaction.financialAccountId === fundAccount.id)
    : [];

  const pendingFundTransactions = fundTransactions
    .filter((transaction) => transaction.reviewStatus === "later")
    .slice(0, 16);

  const recentFundTransactions = fundTransactions.slice(0, 16);
  const personalCardTotal = commitments.reduce(
    (sum, commitment) => sum + commitment.remainingAmount,
    0
  );

  const commitmentsByPayer = new Map<string, typeof commitments>();
  for (const commitment of commitments) {
    const key = commitment.payerUserId || "unknown";
    commitmentsByPayer.set(key, [
      ...(commitmentsByPayer.get(key) ?? []),
      commitment,
    ]);
  }

  return (
    <>
      <PageHeader
        title="Dinheiro"
        description="O Fundo mostra o que vocês têm para viver a viagem. Cartões pessoais aparecem separadamente como compromissos futuros."
      />

      <div className="space-y-7">
        {trip && (
          <TripFundPanel
            tripId={trip.id}
            account={fundAccount}
            balances={balances.map((balance) => ({
              ...balance,
              name: shortName(balance.name),
            }))}
            members={members.map((member) => ({ id: member.id, name: shortName(member.name) }))}
          />
        )}

        <section>
          <div className="section-heading">
            <div>
              <h2>Visão da viagem</h2>
              <p className="mt-1 text-[10px] text-muted">
                Fundo disponível e obrigações pessoais são caixas diferentes.
              </p>
            </div>
          </div>

          <div className="finance-metrics finance-metrics--fund">
            <div>
              <span>Fundo no Mercado Pago</span>
              <strong>{finance?.fund_balance == null ? "—" : formatMoney(finance.fund_balance)}</strong>
            </div>
            <div>
              <span>Reservado no Fundo</span>
              <strong>{formatMoney(finance?.fund_commitments ?? 0)}</strong>
            </div>
            <div>
              <span>Disponível para usar</span>
              <strong>{finance?.available_to_use == null ? "—" : formatMoney(finance.available_to_use)}</strong>
            </div>
            <div>
              <span>Ainda irá às faturas</span>
              <strong>{formatMoney(personalCardTotal)}</strong>
            </div>
          </div>
        </section>

        <section className="finance-note">
          <ShieldCheck size={18} />
          <div>
            <p>Cartão pessoal não aumenta nem reduz o Fundo.</p>
            <span>
              Passagens, hospedagens, ônibus e outros custos estruturais podem passar nas faturas,
              enquanto o Mercado Pago fica reservado para o consumo da viagem.
            </span>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>Ainda passará pelas faturas</h2>
              <p className="mt-1 text-[10px] text-muted">
                Compras da viagem já comprometidas nos cartões pessoais.
              </p>
            </div>
            {trip && (
              <ManualCardExpense
                tripId={trip.id}
                members={members.map((member) => ({ id: member.id, name: shortName(member.name) }))}
              />
            )}
          </div>

          {commitments.length ? (
            <div className="personal-commitments">
              {Array.from(commitmentsByPayer.entries()).map(([payerId, payerCommitments]) => {
                const payer = members.find((member) => member.id === payerId);
                const total = payerCommitments.reduce(
                  (sum, commitment) => sum + commitment.remainingAmount,
                  0
                );

                return (
                  <article key={payerId} className="personal-commitment-group">
                    <div className="personal-commitment-heading">
                      <div>
                        <span>No cartão de</span>
                        <strong>{shortName(payer?.name || payerCommitments[0]?.payerName)}</strong>
                      </div>
                      <b>{formatMoney(total)}</b>
                    </div>
                    <div className="personal-commitment-list">
                      {payerCommitments.map((commitment) => (
                        <div key={commitment.id}>
                          <span className="settings-row-icon"><CreditCard size={15} /></span>
                          <div className="min-w-0 flex-1">
                            <strong>{commitment.title}</strong>
                            <small>
                              {commitment.dueAt ? formatDateTime(commitment.dueAt) : "Vencimento pendente"}
                              {commitment.installmentsTotal && commitment.installmentsTotal > 1
                                ? ` · parcela ${commitment.installmentNumber}/${commitment.installmentsTotal}`
                                : ""}
                            </small>
                          </div>
                          <b>{formatMoney(commitment.remainingAmount)}</b>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-surface">
              <CreditCard size={20} />
              <p>Nenhuma compra em cartão pessoal aguardando fatura.</p>
            </div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>Para organizar</h2>
              <p className="mt-1 text-[10px] text-muted">
                Movimentações do Mercado Pago ainda sem dono ou divisão.
              </p>
            </div>
          </div>

          {pendingFundTransactions.length ? (
            <div className="fund-transaction-list">
              {pendingFundTransactions.map((transaction) => (
                <article key={transaction.id} className="fund-transaction-row">
                  <span className="settings-row-icon">
                    {transaction.direction === "credit" ? <Wallet size={15} /> : <ReceiptText size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong>{transaction.customDescription || transaction.originalDescription || "Movimentação"}</strong>
                    <small>
                      {transaction.occurredAt ? formatDateTime(transaction.occurredAt) : "Data pendente"}
                      {" · "}
                      {transaction.direction === "credit" ? "Entrada no Fundo" : "Saída do Fundo"}
                    </small>
                    <TripFundTransactionActions
                      transactionId={transaction.id}
                      amount={transaction.amount}
                      direction={transaction.direction}
                      pockets={pockets}
                      members={members.map((member) => ({ id: member.id, name: shortName(member.name) }))}
                    />
                  </div>
                  <b className={transaction.direction === "credit" ? "is-credit" : ""}>
                    {transaction.direction === "credit" ? "+" : "−"}
                    {formatMoney(Math.abs(transaction.amount))}
                  </b>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-surface">
              <ReceiptText size={20} />
              <p>Nenhuma movimentação do Fundo aguardando organização.</p>
            </div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>Movimentações do Fundo</h2>
              <p className="mt-1 text-[10px] text-muted">
                Extrato resumido da conta Mercado Pago usada na viagem.
              </p>
            </div>
          </div>

          {recentFundTransactions.length ? (
            <div className="fund-statement">
              {recentFundTransactions.map((transaction) => (
                <div key={transaction.id} className="fund-statement-row">
                  <span className="settings-row-icon">
                    {transaction.direction === "credit" ? <Wallet size={15} /> : <ReceiptText size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong>{transaction.customDescription || transaction.originalDescription || "Movimentação"}</strong>
                    <small>
                      {transaction.occurredAt ? formatDateTime(transaction.occurredAt) : "Data pendente"}
                      {" · "}
                      {transaction.reviewStatus === "trip"
                        ? "Gasto organizado"
                        : transaction.direction === "credit" && transaction.reviewStatus === "not_trip"
                          ? "Aporte identificado"
                          : "Aguardando organização"}
                    </small>
                  </div>
                  <b className={transaction.direction === "credit" ? "is-credit" : ""}>
                    {transaction.direction === "credit" ? "+" : "−"}
                    {formatMoney(Math.abs(transaction.amount))}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-surface">
              <Wallet size={20} />
              <p>As movimentações do Mercado Pago aparecerão aqui após a sincronização.</p>
            </div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <h2>Últimos gastos da viagem</h2>
          </div>

          {expenses.length ? (
            <div className="expense-list">
              {expenses.map((expense) => (
                <div key={expense.id} className="expense-row">
                  <span className="settings-row-icon"><ReceiptText size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p>{expense.title}</p>
                    <span>
                      {formatDateTime(expense.occurred_at)}
                      {expense.payment_method === "trip_fund"
                        ? " · Fundo da viagem"
                        : expense.payment_method === "credit_card"
                          ? " · Cartão pessoal"
                          : ""}
                    </span>
                  </div>
                  <div className="expense-row-actions">
                    <strong>{formatMoney(expense.amount)}</strong>
                    <RecordActions
                      table="expenses"
                      id={expense.id}
                      title={expense.title}
                      fields={[
                        { name: "title", label: "Descrição", required: true },
                        { name: "amount", label: "Valor", type: "number", required: true, min: "0", step: "0.01" },
                        { name: "notes", label: "Nota", type: "textarea" },
                      ]}
                      values={{
                        title: expense.title,
                        amount: expense.amount,
                        notes: expense.notes ?? null,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-surface">
              <ReceiptText size={20} />
              <p>Nenhum gasto registrado até agora.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
