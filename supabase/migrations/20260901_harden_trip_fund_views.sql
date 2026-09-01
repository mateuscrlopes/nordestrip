-- Nordestrip — hardening das views financeiras e índices das novas FKs

alter view public.v_trip_finance_summary set (security_invoker = true);
alter view public.v_trip_fund_person_balances set (security_invoker = true);
alter view public.v_trip_personal_card_commitments set (security_invoker = true);

create index if not exists financial_commitments_payer_user_id_idx
  on public.financial_commitments (payer_user_id);

create index if not exists financial_commitments_source_expense_id_idx
  on public.financial_commitments (source_expense_id);

create index if not exists reservations_payer_user_id_idx
  on public.reservations (payer_user_id);

create index if not exists trip_fund_contributions_created_by_idx
  on public.trip_fund_contributions (created_by);

create index if not exists trip_fund_contributions_financial_transaction_id_idx
  on public.trip_fund_contributions (financial_transaction_id);

create index if not exists trip_fund_contributions_user_id_idx
  on public.trip_fund_contributions (user_id);
