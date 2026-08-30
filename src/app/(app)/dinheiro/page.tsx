import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, expenseStatusOptions } from "@/components/actions/record-status";
import { BudgetPocketsEditor, type BudgetPocket } from "@/components/finance/budget-pockets-editor";
import { ConnectedAccountsEditor } from "@/components/finance/connected-accounts-editor";
import { ManualFundEditor } from "@/components/finance/manual-fund-editor";
import { TransactionReviewActions } from "@/components/finance/transaction-review-actions";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getCurrentUser, getTripExpenses, getTripFinanceSummary, getTripFinancialTransactions, getTripManualFund, getTripPluggyAccounts } from "@/lib/queries/trips";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { CreditCard, ReceiptText, ShieldCheck, Wallet } from "lucide-react";

function money(value: number | null | undefined) {
  return value == null ? null : formatMoney(value);
}

const paymentLabels: Record<string, string> = {
  trip_fund: "Fundo da viagem",
  credit_card: "Crédito",
  debit_card: "Débito",
  pix: "Pix",
  cash: "Dinheiro",
  personal_account: "Conta pessoal",
  other: "Outro",
};

async function getBudgetPockets(tripId: string): Promise<BudgetPocket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_trip_budget_pockets")
    .select("id,label,kind,allocated_amount,spent_amount,available_amount,sort_order")
    .eq("trip_id", tripId)
    .order("sort_order")
    .order("label");

  if (error) throw new Error(`Não foi possível carregar o orçamento por pessoa: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind as "shared" | "person",
    allocatedAmount: Number(row.allocated_amount ?? 0),
    spentAmount: Number(row.spent_amount ?? 0),
    availableAmount: Number(row.available_amount ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export default async function MoneyPage() {
  const user = await getCurrentUser();
  const { trip } = await getCurrentTrip();
  const [finance, expenses, manualFund, pluggyAccounts, transactions, pockets] = trip && user
    ? await Promise.all([
        getTripFinanceSummary(trip.id),
        getTripExpenses(trip.id),
        getTripManualFund(trip.id),
        getTripPluggyAccounts(trip.id, user.id),
        getTripFinancialTransactions(trip.id),
        getBudgetPockets(trip.id),
      ])
    : [null, [], null, [], [], [] as BudgetPocket[]];

  const plannedBudget = pockets.reduce((sum, pocket) => sum + pocket.allocatedAmount, 0);
  const pocketSpent = pockets.reduce((sum, pocket) => sum + pocket.spentAmount, 0);
  const pocketAvailable = pockets.reduce((sum, pocket) => sum + pocket.availableAmount, 0);
  const availableToUse = plannedBudget > 0 ? pocketAvailable : finance?.available_to_use ?? null;

  const pendingTransactions = transactions
    .filter((transaction) => transaction.reviewStatus === "later")
    .slice(0, 12);
  const transactionByExpenseId = new Map(
    transactions
      .filter((transaction) => transaction.reviewStatus === "trip" && transaction.matchedExpenseId)
      .map((transaction) => [transaction.matchedExpenseId as string, transaction])
  );

  const transactionSource = (transaction: (typeof transactions)[number]) => {
    const kind = transaction.accountType === "credit_card" ? "Crédito" : "Conta";
    return transaction.accountName + " · " + kind;
  };

  return (
    <>
      <PageHeader
        title="Dinheiro"
        description="Quanto ainda dá para usar, de quem é cada parte e onde vocês estão pagando."
      />

      <div className="space-y-7">
        <section className="finance-hero">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-petrol/65">Disponível na viagem</p>
              {availableToUse == null ? (
                <>
                  <h2 className="mt-2">Orçamento ainda não definido</h2>
                  <p className="mt-2 max-w-md text-[13px] leading-5 text-muted">
                    Defina quanto fica no compartilhado e quanto fica com cada pessoa.
                  </p>
                </>
              ) : (
                <h2 className="mt-1">{money(availableToUse)}</h2>
              )}
              {plannedBudget > 0 && (
                <p className="mt-2 text-[11px] text-muted">
                  {money(pocketSpent)} usados de {money(plannedBudget)} planejados.
                </p>
              )}
            </div>
            <span className="finance-hero-icon"><Wallet size={20} /></span>
          </div>
        </section>

        {trip && pockets.length > 0 && <BudgetPocketsEditor pockets={pockets} />}

        {trip && (
          <section>
            <ManualFundEditor tripId={trip.id} fund={manualFund} />
          </section>
        )}

        {trip && pluggyAccounts.length > 0 && (
          <ConnectedAccountsEditor tripId={trip.id} accounts={pluggyAccounts} />
        )}

        <section>
          <div className="section-heading">
            <h2>Visão da viagem</h2>
          </div>
          <div className="finance-metrics">
            <div>
              <span>Compromissos futuros</span>
              <strong>{money(finance?.future_commitments) ?? "—"}</strong>
            </div>
            <div>
              <span>Reserva protegida</span>
              <strong>{money(finance?.protected_reserve) ?? "—"}</strong>
            </div>
            <div>
              <span>Gasto classificado</span>
              <strong>{plannedBudget > 0 ? money(pocketSpent) : money(finance?.net_spent) ?? "—"}</strong>
            </div>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>Cartão</h2>
              <p className="mt-1 text-[10px] text-muted">Meio de pagamento, não dinheiro adicional.</p>
            </div>
          </div>
          <div className="card-payment-panel">
            <div className="flex items-center gap-3">
              <span className="operational-icon"><CreditCard size={18} /></span>
              <div>
                <p className="text-[12px] text-white/65">Limite reservado para a viagem</p>
                <p className="mt-1 text-[1.2rem] font-semibold text-white">
                  {money(finance?.allocated_card_limit) ?? "Ainda não definido"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <span className="text-[12px] leading-5 text-white/65">Compras no crédito reduzem o bolso escolhido assim que forem classificadas.</span>
              {finance?.active_card_holds ? (
                <strong className="shrink-0 text-[13px] text-white">{money(finance.active_card_holds)}</strong>
              ) : null}
            </div>
          </div>
        </section>

        <section className="finance-note">
          <ShieldCheck size={18} />
          <div>
            <p>O cartão só muda onde vocês pagam.</p>
            <span>O orçamento continua sendo Compartilhado + Mateus + Ghustavo.</span>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <h2>Para revisar</h2>
              <p className="mt-1 text-[10px] text-muted">Escolha se cada compra foi compartilhada ou individual.</p>
            </div>
          </div>

          {pendingTransactions.length ? (
            <div className="expense-list">
              {pendingTransactions.map((transaction) => (
                <div key={transaction.id} className="expense-row expense-row--review">
                  <span className="settings-row-icon"><ReceiptText size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p>{transaction.customDescription || transaction.originalDescription || "Transação"}</p>
                    <span>
                      {transaction.occurredAt ? formatDateTime(transaction.occurredAt) : "Data pendente"}
                      {" · "}{transactionSource(transaction)}
                      {transaction.direction === "credit" ? " · Entrada" : ""}
                    </span>
                    {transaction.customDescription && transaction.originalDescription && (
                      <small className="mt-1 block truncate text-[9px] text-muted">
                        Original: {transaction.originalDescription}
                      </small>
                    )}
                  </div>
                  <div className="expense-row-actions expense-row-actions--review">
                    <strong>{formatMoney(Math.abs(transaction.amount))}</strong>
                    <TransactionReviewActions
                      id={transaction.id}
                      reviewStatus={transaction.reviewStatus}
                      customDescription={transaction.customDescription}
                      originalDescription={transaction.originalDescription}
                      direction={transaction.direction}
                      pockets={pockets}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-surface">
              <ReceiptText size={20} />
              <p>Nenhuma transação aguardando revisão.</p>
            </div>
          )}
        </section>

        <section>
          <div className="section-heading">
            <h2>Últimos gastos</h2>
          </div>
          {expenses.length ? (
            <div className="expense-list">
              {expenses.map((expense) => {
                const linkedTransaction = transactionByExpenseId.get(expense.id);

                return (
                  <div key={expense.id} className="expense-row">
                    <span className="settings-row-icon"><ReceiptText size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p>{expense.title}</p>
                      <span>
                        {formatDateTime(expense.occurred_at)}
                        {linkedTransaction
                          ? " · " + transactionSource(linkedTransaction)
                          : expense.payment_method
                            ? " · " + (paymentLabels[expense.payment_method] || expense.payment_method)
                            : ""}
                      </span>
                      {linkedTransaction?.originalDescription && linkedTransaction.originalDescription !== expense.title && (
                        <small className="mt-1 block truncate text-[9px] text-muted">
                          Original: {linkedTransaction.originalDescription}
                        </small>
                      )}
                    </div>
                    <div className="expense-row-actions">
                      <strong>{formatMoney(expense.amount)}</strong>
                      {linkedTransaction ? (
                        <TransactionReviewActions
                          id={linkedTransaction.id}
                          reviewStatus={linkedTransaction.reviewStatus}
                          customDescription={linkedTransaction.customDescription}
                          originalDescription={linkedTransaction.originalDescription}
                          direction={linkedTransaction.direction}
                          pockets={pockets}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <RecordStatus
                            table="expenses"
                            id={expense.id}
                            value={expense.status}
                            options={expenseStatusOptions}
                            label={"Status de " + expense.title}
                            compact
                          />
                          <RecordActions
                            table="expenses"
                            id={expense.id}
                            title={expense.title}
                            fields={[
                              { name: "title", label: "Descrição", required: true },
                              { name: "amount", label: "Valor", type: "number", required: true, min: "0", step: "0.01" },
                              {
                                name: "payment_method",
                                label: "Pagamento",
                                type: "select",
                                options: [
                                  { value: "trip_fund", label: "Fundo da viagem" },
                                  { value: "credit_card", label: "Cartão de crédito" },
                                  { value: "debit_card", label: "Cartão de débito" },
                                  { value: "pix", label: "Pix" },
                                  { value: "cash", label: "Dinheiro" },
                                  { value: "personal_account", label: "Conta pessoal" },
                                  { value: "other", label: "Outro" },
                                ],
                              },
                              { name: "occurred_at", label: "Quando", type: "datetime-local" },
                              { name: "notes", label: "Nota", type: "textarea" },
                            ]}
                            values={{
                              title: expense.title,
                              amount: expense.amount,
                              payment_method: expense.payment_method ?? null,
                              occurred_at: expense.occurred_at,
                              notes: expense.notes ?? null,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
