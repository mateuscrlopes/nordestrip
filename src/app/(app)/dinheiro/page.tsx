import { RecordActions } from "@/components/actions/record-actions";
import { PageHeader } from "@/components/layout/page-header";
import { ManualFundEditor } from "@/components/finance/manual-fund-editor";
import { RecordStatus, expenseStatusOptions } from "@/components/actions/record-status";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripExpenses, getTripFinanceSummary, getTripManualFund } from "@/lib/queries/trips";
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

export default async function MoneyPage() {
  const { trip } = await getCurrentTrip();
  const [finance, expenses, manualFund] = trip
    ? await Promise.all([
        getTripFinanceSummary(trip.id),
        getTripExpenses(trip.id),
        getTripManualFund(trip.id),
      ])
    : [null, [], null];

  return (
    <>
      <PageHeader
        title="Dinheiro"
        description="Fundo, compromissos e meios de pagamento da viagem."
      />

      <div className="space-y-7">
        <section className="finance-hero">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-petrol/65">Disponível para usar</p>
              {finance?.available_to_use == null ? (
                <>
                  <h2 className="mt-2">Fundo ainda não conectado</h2>
                  <p className="mt-2 max-w-md text-[13px] leading-5 text-muted">
                    O saldo aparecerá aqui quando a conta da viagem estiver vinculada.
                  </p>
                </>
              ) : (
                <h2 className="mt-1">{money(finance.available_to_use)}</h2>
              )}
            </div>
            <span className="finance-hero-icon"><Wallet size={20} /></span>
          </div>
        </section>

        {trip && (
          <section>
            <ManualFundEditor tripId={trip.id} fund={manualFund} />
          </section>
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
              <span>Gasto líquido</span>
              <strong>{money(finance?.net_spent) ?? "—"}</strong>
            </div>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2>Cartão da viagem</h2>
          </div>
          <div className="card-payment-panel">
            <div className="flex items-center gap-3">
              <span className="operational-icon"><CreditCard size={18} /></span>
              <div>
                <p className="text-[12px] text-white/65">Limite alocado</p>
                <p className="mt-1 text-[1.2rem] font-semibold text-white">
                  {money(finance?.allocated_card_limit) ?? "Ainda não definido"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-[12px] text-white/65">Bloqueios temporários</span>
              <strong className="text-[13px] text-white">
                {money(finance?.active_card_holds) ?? "—"}
              </strong>
            </div>
          </div>
        </section>

        <section className="finance-note">
          <ShieldCheck size={18} />
          <div>
            <p>Limite de cartão não é orçamento.</p>
            <span>O disponível para usar continua sendo a referência principal da viagem.</span>
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2>Últimos gastos</h2>
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
                      {expense.payment_method ? ` · ${paymentLabels[expense.payment_method] || expense.payment_method}` : ""}
                    </span>
                  </div>
                  <div className="expense-row-actions">
                    <strong>{formatMoney(expense.amount)}</strong>
                    <div className="flex items-center gap-2">
                      <RecordStatus
                        table="expenses"
                        id={expense.id}
                        value={expense.status}
                        options={expenseStatusOptions}
                        label={`Status de ${expense.title}`}
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
