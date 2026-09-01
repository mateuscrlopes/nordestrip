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
