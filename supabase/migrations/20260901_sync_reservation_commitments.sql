-- Nordestrip — projeção automática de compromissos financeiros das reservas
-- Reservations são a fonte de verdade do planejamento; os commitments abaixo
-- são derivados e podem ser regenerados enquanto ainda não viraram gasto real.

create or replace function public.sync_reservation_financial_commitments()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_remaining numeric;
  v_installments integer;
  v_base numeric;
  v_amount numeric;
  v_index integer;
  v_first_due timestamptz;
  v_lifecycle text;
  v_kind text;
begin
  -- Em DELETE, NEW não existe. Limpa a projeção usando OLD e encerra.
  if tg_op = 'DELETE' then
    delete from public.financial_commitments
    where reservation_id = old.id
      and source = 'reservation_auto';
    return old;
  end if;

  -- Em INSERT/UPDATE, a projeção é totalmente derivada da reserva atual.
  delete from public.financial_commitments
  where reservation_id = new.id
    and source = 'reservation_auto';

  if new.archived_at is not null
     or new.status in ('paid', 'cancelled')
     or new.total_amount is null
     or new.total_amount <= 0 then
    return new;
  end if;

  v_remaining := greatest(new.total_amount - coalesce(new.paid_amount, 0), 0);
  if v_remaining <= 0 then
    return new;
  end if;

  v_lifecycle := case
    when new.status = 'quoted' then 'quoted'
    when new.status = 'reserved' then 'reserved'
    when new.status = 'purchased' then 'purchased'
    else 'estimated'
  end;

  if new.payment_method = 'credit_card' and new.payer_user_id is not null then
    v_kind := 'personal_card';
    v_installments := greatest(coalesce(new.planned_installments, 1), 1);
    v_first_due := coalesce(new.first_card_due_at, new.payment_due_at);

    v_base := round(v_remaining / v_installments, 2);

    for v_index in 1..v_installments loop
      if v_index = v_installments then
        v_amount := round(v_remaining - (v_base * (v_installments - 1)), 2);
      else
        v_amount := v_base;
      end if;

      insert into public.financial_commitments (
        trip_id,
        stop_id,
        reservation_id,
        accommodation_id,
        transport_segment_id,
        itinerary_item_id,
        title,
        lifecycle_status,
        amount,
        paid_amount,
        currency,
        due_at,
        payment_method,
        source,
        notes,
        payer_user_id,
        installment_number,
        installments_total,
        commitment_kind
      )
      values (
        new.trip_id,
        new.stop_id,
        new.id,
        new.accommodation_id,
        new.transport_segment_id,
        new.itinerary_item_id,
        new.title,
        v_lifecycle,
        v_amount,
        0,
        coalesce(new.currency, 'BRL'),
        case
          when v_first_due is null then null
          else v_first_due + ((v_index - 1) || ' month')::interval
        end,
        'credit_card',
        'reservation_auto',
        new.notes,
        new.payer_user_id,
        v_index,
        v_installments,
        v_kind
      );
    end loop;

    return new;
  end if;

  v_kind := case
    when new.payment_method = 'trip_fund' then 'trip_fund'
    else 'supplier'
  end;

  insert into public.financial_commitments (
    trip_id,
    stop_id,
    reservation_id,
    accommodation_id,
    transport_segment_id,
    itinerary_item_id,
    title,
    lifecycle_status,
    amount,
    paid_amount,
    currency,
    due_at,
    payment_method,
    source,
    notes,
    payer_user_id,
    installment_number,
    installments_total,
    commitment_kind
  )
  values (
    new.trip_id,
    new.stop_id,
    new.id,
    new.accommodation_id,
    new.transport_segment_id,
    new.itinerary_item_id,
    new.title,
    v_lifecycle,
    v_remaining,
    0,
    coalesce(new.currency, 'BRL'),
    new.payment_due_at,
    new.payment_method,
    'reservation_auto',
    new.notes,
    new.payer_user_id,
    1,
    1,
    v_kind
  );

  return new;
end;
$$;

drop trigger if exists sync_reservation_financial_commitments_trigger
  on public.reservations;

create trigger sync_reservation_financial_commitments_trigger
after insert or update or delete on public.reservations
for each row
execute function public.sync_reservation_financial_commitments();

-- Gera as projeções das reservas já existentes sem alterar gastos reais.
update public.reservations
set updated_at = now()
where archived_at is null;

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
    ), 0::numeric) as future_commitments,
    coalesce(sum(greatest(fc.amount - fc.paid_amount, 0::numeric)) filter (
      where fc.lifecycle_status not in ('paid','cancelled')
        and fc.archived_at is null
        and (
          fc.commitment_kind = 'trip_fund'
          or fc.payment_method = 'trip_fund'
        )
    ), 0::numeric) as fund_commitments
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
      coalesce(f.fund_balance, 0::numeric)
      - coalesce(c.fund_commitments, 0::numeric)
      - coalesce(fs.protected_reserve, 0::numeric),
      0::numeric
    )
  end as available_to_use,
  coalesce(s.gross_spent, 0::numeric) - coalesce(s.refunds, 0::numeric) as net_spent,
  coalesce(cards.allocated_card_limit, 0::numeric) as allocated_card_limit,
  coalesce(h.active_holds, 0::numeric) as active_card_holds,
  coalesce(c.fund_commitments, 0::numeric) as fund_commitments
from public.trips t
left join public.trip_finance_settings fs on fs.trip_id = t.id
left join fund f on f.trip_id = t.id
left join commitments c on c.trip_id = t.id
left join spent s on s.trip_id = t.id
left join cards on cards.trip_id = t.id
left join holds h on h.trip_id = t.id;

alter view public.v_trip_finance_summary set (security_invoker = true);
grant select on public.v_trip_finance_summary to authenticated;
