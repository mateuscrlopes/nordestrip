-- Nordestrip — fundo da viagem e compromissos pessoais
-- Separa saldo real do Mercado Pago, propriedade virtual do fundo
-- e compromissos que ainda passarao pelas faturas pessoais.

alter table public.financial_commitments
  add column if not exists payer_user_id uuid references public.profiles(id),
  add column if not exists installment_number integer,
  add column if not exists installments_total integer,
  add column if not exists commitment_kind text not null default 'supplier',
  add column if not exists source_expense_id uuid references public.expenses(id) on delete set null;

create index if not exists financial_commitments_personal_card_idx
  on public.financial_commitments (trip_id, payer_user_id, due_at)
  where commitment_kind = 'personal_card' and archived_at is null;

alter table public.reservations
  add column if not exists payment_timing text,
  add column if not exists payer_user_id uuid references public.profiles(id),
  add column if not exists planned_installments integer not null default 1,
  add column if not exists first_card_due_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_payment_timing_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_payment_timing_check
      check (
        payment_timing is null
        or payment_timing in ('pay_now','prepaid','at_property','partial')
      );
  end if;
end $$;

create table if not exists public.trip_fund_contributions (
  id                       uuid primary key default gen_random_uuid(),
  trip_id                  uuid not null references public.trips(id) on delete cascade,
  user_id                  uuid not null references public.profiles(id),
  financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  amount                   numeric not null check (amount > 0),
  contribution_at          timestamptz not null default now(),
  status                   text not null default 'confirmed'
                           check (status in ('pending_match','confirmed','rejected')),
  source                   text not null default 'manual'
                           check (source in ('transaction','receipt','manual')),
  receipt_path             text,
  receipt_filename         text,
  receipt_mime             text,
  extracted_data           jsonb not null default '{}'::jsonb,
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index if not exists trip_fund_contribution_tx_uq
  on public.trip_fund_contributions (trip_id, financial_transaction_id)
  where financial_transaction_id is not null;

create index if not exists trip_fund_contributions_user_idx
  on public.trip_fund_contributions (trip_id, user_id, contribution_at);

alter table public.trip_fund_contributions enable row level security;

drop policy if exists trip_fund_contributions_member_all on public.trip_fund_contributions;
create policy trip_fund_contributions_member_all
  on public.trip_fund_contributions
  for all
  to authenticated
  using (public.is_trip_member(trip_id))
  with check (
    public.is_trip_member(trip_id)
    and exists (
      select 1
      from public.trip_members tm
      where tm.trip_id = trip_fund_contributions.trip_id
        and tm.user_id = trip_fund_contributions.user_id
    )
  );

grant select, insert, update, delete on public.trip_fund_contributions to authenticated;

-- Com a viagem em dupla, garante que os bolsos pessoais representem
-- os membros reais. O nome exibido do perfil pode ter sufixos de login.
update public.trip_budget_pockets p
set linked_user_id = tm.user_id,
    updated_at = now()
from public.trip_members tm
join public.profiles pr on pr.id = tm.user_id
where p.trip_id = tm.trip_id
  and p.kind = 'person'
  and p.linked_user_id is null
  and (
    lower(p.label) = lower(pr.name)
    or lower(pr.name) like lower(p.label) || '.%'
    or lower(pr.name) like lower(p.label) || ' %'
  );

-- Saldo virtual por pessoa = aportes confirmados - consumo classificado
-- para o bolso pessoal daquela pessoa.
create or replace view public.v_trip_fund_person_balances as
with members as (
  select
    tm.trip_id,
    tm.user_id,
    coalesce(nullif(p.name, ''), 'Participante') as name
  from public.trip_members tm
  join public.profiles p on p.id = tm.user_id
),
contributions as (
  select
    c.trip_id,
    c.user_id,
    coalesce(sum(c.amount) filter (where c.status = 'confirmed'), 0::numeric) as contributed_amount
  from public.trip_fund_contributions c
  group by c.trip_id, c.user_id
),
spent as (
  select
    ft.trip_id,
    pocket.linked_user_id as user_id,
    coalesce(sum(alloc.amount) filter (
      where ft.review_status = 'trip'
        and ft.direction <> 'credit'
        and exists (
          select 1
          from public.trip_financial_accounts tfa
          where tfa.trip_id = ft.trip_id
            and tfa.financial_account_id = ft.financial_account_id
            and tfa.purpose = 'trip_fund'
            and tfa.include_balance_in_available = true
            and tfa.archived_at is null
        )
    ), 0::numeric) as spent_amount
  from public.financial_transaction_allocations alloc
  join public.financial_transactions ft on ft.id = alloc.transaction_id
  join public.trip_budget_pockets pocket on pocket.id = alloc.pocket_id
  where pocket.kind = 'person'
    and pocket.linked_user_id is not null
    and pocket.archived_at is null
  group by ft.trip_id, pocket.linked_user_id
)
select
  m.trip_id,
  m.user_id,
  m.name,
  coalesce(c.contributed_amount, 0::numeric) as contributed_amount,
  coalesce(s.spent_amount, 0::numeric) as spent_amount,
  coalesce(c.contributed_amount, 0::numeric) - coalesce(s.spent_amount, 0::numeric) as available_amount
from members m
left join contributions c on c.trip_id = m.trip_id and c.user_id = m.user_id
left join spent s on s.trip_id = m.trip_id and s.user_id = m.user_id;

grant select on public.v_trip_fund_person_balances to authenticated;

-- O fundo real nao e reduzido por compromissos que serao pagos nas
-- faturas pessoais. Eles continuam visiveis, mas em uma caixa separada.
create or replace view public.v_trip_finance_summary as
with fund as (
  select
    tfa.trip_id,
    sum(fa.current_balance) filter (
      where tfa.purpose = 'trip_fund'
        and tfa.include_balance_in_available = true
        and tfa.archived_at is null
        and fa.archived_at is null
    ) as fund_balance,
    count(*) filter (
      where tfa.purpose = 'trip_fund'
        and tfa.include_balance_in_available = true
        and tfa.archived_at is null
        and fa.archived_at is null
    ) as fund_sources
  from public.trip_financial_accounts tfa
  join public.financial_accounts fa on fa.id = tfa.financial_account_id
  group by tfa.trip_id
),
commitments as (
  select
    fc.trip_id,
    coalesce(sum(greatest(fc.amount - fc.paid_amount, 0::numeric)) filter (
      where fc.lifecycle_status not in ('paid','cancelled')
        and fc.archived_at is null
    ), 0::numeric) as future_commitments
  from public.financial_commitments fc
  group by fc.trip_id
),
spent as (
  select
    e.trip_id,
    coalesce(sum(e.amount) filter (
      where e.status in ('posted','partially_refunded')
        and e.is_transfer = false
        and e.archived_at is null
        and e.refund_of_expense_id is null
    ), 0::numeric) as gross_spent,
    coalesce(sum(e.amount) filter (
      where e.status in ('posted','refunded','partially_refunded')
        and e.refund_of_expense_id is not null
        and e.archived_at is null
    ), 0::numeric) as refunds
  from public.expenses e
  group by e.trip_id
),
cards as (
  select
    tfa.trip_id,
    coalesce(sum(tfa.allocated_credit_limit) filter (
      where tfa.purpose = 'payment_card'
        and tfa.archived_at is null
    ), 0::numeric) as allocated_card_limit
  from public.trip_financial_accounts tfa
  group by tfa.trip_id
),
holds as (
  select
    h.trip_id,
    coalesce(sum(h.amount) filter (
      where h.status in ('expected','active')
        and h.archived_at is null
    ), 0::numeric) as active_holds
  from public.temporary_holds h
  group by h.trip_id
)
select
  t.id as trip_id,
  fs.total_budget,
  fs.protected_reserve,
  fs.discovery_budget,
  f.fund_balance,
  coalesce(c.future_commitments, 0::numeric) as future_commitments,
  case
    when coalesce(f.fund_sources, 0) = 0 then null::numeric
    else greatest(
      coalesce(f.fund_balance, 0::numeric) - coalesce(fs.protected_reserve, 0::numeric),
      0::numeric
    )
  end as available_to_use,
  coalesce(s.gross_spent, 0::numeric) - coalesce(s.refunds, 0::numeric) as net_spent,
  coalesce(cards.allocated_card_limit, 0::numeric) as allocated_card_limit,
  coalesce(h.active_holds, 0::numeric) as active_card_holds
from public.trips t
left join public.trip_finance_settings fs on fs.trip_id = t.id
left join fund f on f.trip_id = t.id
left join commitments c on c.trip_id = t.id
left join spent s on s.trip_id = t.id
left join cards on cards.trip_id = t.id
left join holds h on h.trip_id = t.id;

grant select on public.v_trip_finance_summary to authenticated;

create or replace view public.v_trip_personal_card_commitments as
select
  fc.id,
  fc.trip_id,
  fc.payer_user_id,
  p.name as payer_name,
  fc.title,
  fc.amount,
  fc.paid_amount,
  greatest(fc.amount - fc.paid_amount, 0::numeric) as remaining_amount,
  fc.due_at,
  fc.installment_number,
  fc.installments_total,
  fc.source_expense_id,
  fc.lifecycle_status
from public.financial_commitments fc
left join public.profiles p on p.id = fc.payer_user_id
where fc.commitment_kind = 'personal_card'
  and fc.archived_at is null
  and fc.lifecycle_status not in ('paid','cancelled');

grant select on public.v_trip_personal_card_commitments to authenticated;

-- Classifica uma saida do Fundo em um ou mais bolsos pessoais.
-- p_allocations = [{"pocket_id":"uuid","amount":60}, ...]
create or replace function public.review_trip_fund_transaction(
  p_transaction_id uuid,
  p_allocations jsonb,
  p_custom_description text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx public.financial_transactions%rowtype;
  v_expense_id uuid;
  v_title text;
  v_sum numeric;
  v_item record;
  v_pocket record;
begin
  select * into v_tx
  from public.financial_transactions
  where id = p_transaction_id;

  if not found or v_tx.trip_id is null or not public.is_trip_member(v_tx.trip_id) then
    raise exception 'transaction-not-found-or-access-denied';
  end if;

  if v_tx.direction = 'credit' then
    raise exception 'credit-transaction-is-not-expense';
  end if;

  if not exists (
    select 1
    from public.trip_financial_accounts tfa
    where tfa.trip_id = v_tx.trip_id
      and tfa.financial_account_id = v_tx.financial_account_id
      and tfa.purpose = 'trip_fund'
      and tfa.include_balance_in_available = true
      and tfa.archived_at is null
  ) then
    raise exception 'transaction-is-not-from-trip-fund';
  end if;

  select round(coalesce(sum((item->>'amount')::numeric), 0), 2)
    into v_sum
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) item;

  if abs(v_sum - round(abs(v_tx.amount), 2)) > 0.01 then
    raise exception 'allocation-total-mismatch';
  end if;

  v_title := coalesce(nullif(btrim(p_custom_description), ''), nullif(btrim(v_tx.description), ''), 'Gasto');
  v_expense_id := v_tx.matched_expense_id;

  if v_expense_id is null then
    insert into public.expenses (
      trip_id, title, amount, currency, payer_user_id, payment_method,
      occurred_at, status, source, external_transaction_id, is_transfer
    )
    values (
      v_tx.trip_id, v_title, abs(v_tx.amount), v_tx.currency, null, 'trip_fund',
      coalesce(v_tx.occurred_at, now()),
      case when v_tx.posting_status = 'pending' then 'pending' else 'posted' end,
      'pluggy', v_tx.external_id, v_tx.is_transfer
    )
    returning id into v_expense_id;
  else
    update public.expenses
    set title = v_title,
        amount = abs(v_tx.amount),
        currency = v_tx.currency,
        payer_user_id = null,
        payment_method = 'trip_fund',
        occurred_at = coalesce(v_tx.occurred_at, occurred_at),
        status = case when v_tx.posting_status = 'pending' then 'pending' else 'posted' end,
        archived_at = null,
        updated_at = now()
    where id = v_expense_id and trip_id = v_tx.trip_id;
  end if;

  delete from public.financial_transaction_allocations
  where transaction_id = p_transaction_id;

  delete from public.expense_splits
  where expense_id = v_expense_id;

  for v_item in
    select
      (item->>'pocket_id')::uuid as pocket_id,
      round((item->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_allocations) item
  loop
    select id, trip_id, linked_user_id, kind
      into v_pocket
    from public.trip_budget_pockets
    where id = v_item.pocket_id
      and archived_at is null;

    if not found
       or v_pocket.trip_id <> v_tx.trip_id
       or v_pocket.kind <> 'person'
       or v_pocket.linked_user_id is null then
      raise exception 'invalid-person-pocket';
    end if;

    insert into public.financial_transaction_allocations (
      transaction_id, pocket_id, amount
    )
    values (p_transaction_id, v_pocket.id, v_item.amount);

    insert into public.expense_splits (
      expense_id, user_id, amount, percentage
    )
    values (
      v_expense_id,
      v_pocket.linked_user_id,
      v_item.amount,
      case when abs(v_tx.amount) > 0
        then round((v_item.amount / abs(v_tx.amount)) * 100, 4)
        else null end
    );
  end loop;

  update public.financial_transactions
  set custom_description = nullif(btrim(p_custom_description), ''),
      review_status = 'trip',
      matched_expense_id = v_expense_id,
      updated_at = now()
  where id = p_transaction_id;

  return jsonb_build_object(
    'review_status', 'trip',
    'expense_id', v_expense_id,
    'allocated_amount', v_sum
  );
end;
$$;

revoke all on function public.review_trip_fund_transaction(uuid, jsonb, text) from public;
grant execute on function public.review_trip_fund_transaction(uuid, jsonb, text) to authenticated;

create or replace function public.assign_trip_fund_contribution(
  p_transaction_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx public.financial_transactions%rowtype;
  v_id uuid;
begin
  select * into v_tx
  from public.financial_transactions
  where id = p_transaction_id;

  if not found or v_tx.trip_id is null or not public.is_trip_member(v_tx.trip_id) then
    raise exception 'transaction-not-found-or-access-denied';
  end if;

  if v_tx.direction <> 'credit' then
    raise exception 'only-credit-can-be-contribution';
  end if;

  if not exists (
    select 1
    from public.trip_financial_accounts tfa
    where tfa.trip_id = v_tx.trip_id
      and tfa.financial_account_id = v_tx.financial_account_id
      and tfa.purpose = 'trip_fund'
      and tfa.include_balance_in_available = true
      and tfa.archived_at is null
  ) then
    raise exception 'transaction-is-not-from-trip-fund';
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = v_tx.trip_id and tm.user_id = p_user_id
  ) then
    raise exception 'user-is-not-trip-member';
  end if;

  insert into public.trip_fund_contributions (
    trip_id, user_id, financial_transaction_id, amount,
    contribution_at, status, source, created_by
  )
  values (
    v_tx.trip_id, p_user_id, v_tx.id, abs(v_tx.amount),
    coalesce(v_tx.occurred_at, now()), 'confirmed', 'transaction', auth.uid()
  )
  on conflict (trip_id, financial_transaction_id)
    where financial_transaction_id is not null
  do update set
    user_id = excluded.user_id,
    amount = excluded.amount,
    contribution_at = excluded.contribution_at,
    status = 'confirmed',
    source = 'transaction',
    updated_at = now()
  returning id into v_id;

  update public.financial_transactions
  set review_status = 'not_trip',
      updated_at = now()
  where id = v_tx.id;

  return v_id;
end;
$$;

revoke all on function public.assign_trip_fund_contribution(uuid, uuid) from public;
grant execute on function public.assign_trip_fund_contribution(uuid, uuid) to authenticated;

-- Registra compra no cartao pessoal e cria as parcelas futuras da fatura.
-- p_splits = [{"user_id":"uuid","amount":300}, ...]
create or replace function public.create_manual_card_expense(
  p_trip_id uuid,
  p_title text,
  p_amount numeric,
  p_payer_user_id uuid,
  p_splits jsonb,
  p_installments integer default 1,
  p_first_due date default current_date,
  p_occurred_at timestamptz default now(),
  p_stop_id uuid default null,
  p_category_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expense_id uuid;
  v_sum numeric;
  v_item record;
  v_base numeric;
  v_value numeric;
  v_index integer;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'access-denied';
  end if;

  if p_amount <= 0 or p_installments < 1 or p_installments > 60 then
    raise exception 'invalid-expense';
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = p_payer_user_id
  ) then
    raise exception 'payer-is-not-trip-member';
  end if;

  select round(coalesce(sum((item->>'amount')::numeric), 0), 2)
    into v_sum
  from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) item;

  if abs(v_sum - round(p_amount, 2)) > 0.01 then
    raise exception 'split-total-mismatch';
  end if;

  insert into public.expenses (
    trip_id, stop_id, category_id, title, amount, currency,
    payer_user_id, payment_method, occurred_at, status, source,
    is_transfer, notes
  )
  values (
    p_trip_id, p_stop_id, p_category_id, btrim(p_title), round(p_amount, 2), 'BRL',
    p_payer_user_id, 'credit_card', p_occurred_at, 'posted', 'manual',
    false, p_notes
  )
  returning id into v_expense_id;

  for v_item in
    select
      (item->>'user_id')::uuid as user_id,
      round((item->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_splits) item
  loop
    if not exists (
      select 1 from public.trip_members tm
      where tm.trip_id = p_trip_id and tm.user_id = v_item.user_id
    ) then
      raise exception 'split-user-is-not-trip-member';
    end if;

    insert into public.expense_splits (
      expense_id, user_id, amount, percentage
    )
    values (
      v_expense_id,
      v_item.user_id,
      v_item.amount,
      round((v_item.amount / p_amount) * 100, 4)
    );
  end loop;

  v_base := round(p_amount / p_installments, 2);

  for v_index in 1..p_installments loop
    if v_index = p_installments then
      v_value := round(p_amount - (v_base * (p_installments - 1)), 2);
    else
      v_value := v_base;
    end if;

    insert into public.financial_commitments (
      trip_id, stop_id, category_id, title, lifecycle_status,
      amount, paid_amount, currency, due_at, payment_method,
      source, notes, payer_user_id, installment_number,
      installments_total, commitment_kind, source_expense_id
    )
    values (
      p_trip_id,
      p_stop_id,
      p_category_id,
      btrim(p_title),
      'purchased',
      v_value,
      0,
      'BRL',
      (p_first_due + ((v_index - 1) || ' month')::interval),
      'credit_card',
      'manual_personal_card',
      p_notes,
      p_payer_user_id,
      v_index,
      p_installments,
      'personal_card',
      v_expense_id
    );
  end loop;

  return v_expense_id;
end;
$$;

revoke all on function public.create_manual_card_expense(
  uuid, text, numeric, uuid, jsonb, integer, date, timestamptz, uuid, uuid, text
) from public;

grant execute on function public.create_manual_card_expense(
  uuid, text, numeric, uuid, jsonb, integer, date, timestamptz, uuid, uuid, text
) to authenticated;

-- Bucket privado para comprovantes de aporte.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'trip-fund-receipts',
  'trip-fund-receipts',
  false,
  12582912,
  array['application/pdf','image/png','image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists trip_fund_receipts_read on storage.objects;
create policy trip_fund_receipts_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'trip-fund-receipts'
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists trip_fund_receipts_insert on storage.objects;
create policy trip_fund_receipts_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'trip-fund-receipts'
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists trip_fund_receipts_update on storage.objects;
create policy trip_fund_receipts_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'trip-fund-receipts'
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'trip-fund-receipts'
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );
