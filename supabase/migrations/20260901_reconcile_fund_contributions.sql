
create or replace function public.reconcile_pending_trip_fund_contributions(
  p_trip_id uuid
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_contribution record;
  v_transaction_id uuid;
  v_count integer;
  v_matched integer := 0;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'access-denied';
  end if;

  for v_contribution in
    select c.id, c.amount, c.contribution_at
    from public.trip_fund_contributions c
    where c.trip_id = p_trip_id
      and c.status = 'pending_match'
      and c.financial_transaction_id is null
    order by c.contribution_at
  loop
    select count(*), min(ft.id)
      into v_count, v_transaction_id
    from public.financial_transactions ft
    where ft.trip_id = p_trip_id
      and ft.direction = 'credit'
      and abs(abs(ft.amount) - v_contribution.amount) <= 0.01
      and (
        v_contribution.contribution_at is null
        or ft.occurred_at is null
        or abs(extract(epoch from (ft.occurred_at - v_contribution.contribution_at))) <= 259200
      )
      and exists (
        select 1
        from public.trip_financial_accounts tfa
        where tfa.trip_id = p_trip_id
          and tfa.financial_account_id = ft.financial_account_id
          and tfa.purpose = 'trip_fund'
          and tfa.include_balance_in_available = true
          and tfa.archived_at is null
      )
      and not exists (
        select 1
        from public.trip_fund_contributions used
        where used.trip_id = p_trip_id
          and used.financial_transaction_id = ft.id
      );

    if v_count = 1 and v_transaction_id is not null then
      update public.trip_fund_contributions
      set financial_transaction_id = v_transaction_id,
          status = 'confirmed',
          updated_at = now(),
          extracted_data = coalesce(extracted_data, '{}'::jsonb)
            || jsonb_build_object('reconciled_at', now(), 'matched_transaction_id', v_transaction_id)
      where id = v_contribution.id;

      update public.financial_transactions
      set review_status = 'not_trip',
          updated_at = now()
      where id = v_transaction_id;

      v_matched := v_matched + 1;
    end if;
  end loop;

  return v_matched;
end;
$$;

revoke all on function public.reconcile_pending_trip_fund_contributions(uuid) from public;
grant execute on function public.reconcile_pending_trip_fund_contributions(uuid) to authenticated;
