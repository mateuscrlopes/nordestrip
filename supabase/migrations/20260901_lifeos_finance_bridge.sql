-- Nordestrip — ponte financeira confiavel com o LifeOS
-- Regra: Nordestrip descreve a compra da viagem; LifeOS administra o acerto entre pessoas.

create table if not exists public.lifeos_sync_queue (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete set null,
  external_expense_id uuid not null unique,
  action text not null default 'upsert'
    check (action in ('upsert','cancel')),
  status text not null default 'pending'
    check (status in ('pending','dispatched','sent','error','conflict','ignored')),
  request_id bigint,
  attempts integer not null default 0 check (attempts >= 0),
  last_http_status integer,
  last_error text,
  response_body text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_sync_queue_trip_idx
  on public.lifeos_sync_queue (trip_id, updated_at desc);

create index if not exists lifeos_sync_queue_pending_idx
  on public.lifeos_sync_queue (status, next_attempt_at)
  where status in ('pending','error');

alter table public.lifeos_sync_queue enable row level security;

drop policy if exists lifeos_sync_queue_member_select on public.lifeos_sync_queue;
create policy lifeos_sync_queue_member_select
  on public.lifeos_sync_queue
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

grant select on public.lifeos_sync_queue to authenticated;

create or replace function public.lifeos_bridge_payload(
  p_expense_id uuid,
  p_action text default 'upsert'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses%rowtype;
  v_trip_name text;
  v_splits jsonb;
  v_installments integer := 1;
  v_first_due date;
begin
  select *
    into v_expense
  from public.expenses e
  where e.id = p_expense_id;

  if not found then
    return null;
  end if;

  select t.name
    into v_trip_name
  from public.trips t
  where t.id = v_expense.trip_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', s.user_id,
        'amount', s.amount
      )
      order by s.user_id
    ),
    '[]'::jsonb
  )
  into v_splits
  from public.expense_splits s
  where s.expense_id = v_expense.id;

  select
    greatest(coalesce(max(fc.installments_total), 1), 1),
    min(fc.due_at::date)
  into
    v_installments,
    v_first_due
  from public.financial_commitments fc
  where fc.source_expense_id = v_expense.id
    and fc.commitment_kind = 'personal_card'
    and fc.archived_at is null;

  v_first_due := coalesce(
    v_first_due,
    v_expense.occurred_at::date,
    current_date
  );

  return jsonb_build_object(
    'action', case when p_action = 'cancel' then 'cancel' else 'upsert' end,
    'expense_id', v_expense.id,
    'trip_id', v_expense.trip_id,
    'trip_name', v_trip_name,
    'title', v_expense.title,
    'amount', v_expense.amount,
    'payer_user_id', v_expense.payer_user_id,
    'splits', v_splits,
    'installments', v_installments,
    'first_due', v_first_due,
    'payment_method', v_expense.payment_method,
    'occurred_at', v_expense.occurred_at,
    'updated_at', v_expense.updated_at,
    'notes', v_expense.notes,
    'source_url', 'https://nordestrip.vercel.app/dinheiro'
  );
end;
$$;

revoke all on function public.lifeos_bridge_payload(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lifeos_bridge_payload(uuid, text)
  to service_role;

create or replace function public.queue_lifeos_expense_sync(
  p_expense_id uuid,
  p_requested_action text default 'upsert'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses%rowtype;
  v_action text := case when p_requested_action = 'cancel' then 'cancel' else 'upsert' end;
  v_has_other_share boolean;
  v_was_synced boolean;
begin
  select *
    into v_expense
  from public.expenses e
  where e.id = p_expense_id;

  if not found then
    return;
  end if;

  if v_expense.payment_method <> 'credit_card' then
    return;
  end if;

  select exists (
    select 1
    from public.expense_splits s
    where s.expense_id = v_expense.id
      and s.user_id <> v_expense.payer_user_id
      and s.amount > 0
  ) into v_has_other_share;

  select exists (
    select 1
    from public.lifeos_sync_queue q
    where q.external_expense_id = v_expense.id
      and q.status in ('sent','conflict','dispatched','error','pending')
  ) into v_was_synced;

  if v_expense.archived_at is not null then
    v_action := 'cancel';
  elsif not v_has_other_share then
    if v_was_synced then
      v_action := 'cancel';
    else
      insert into public.lifeos_sync_queue (
        trip_id, expense_id, external_expense_id, action, status,
        next_attempt_at, updated_at
      )
      values (
        v_expense.trip_id, v_expense.id, v_expense.id, 'upsert', 'ignored',
        now(), now()
      )
      on conflict (external_expense_id) do update
      set trip_id = excluded.trip_id,
          expense_id = excluded.expense_id,
          action = 'upsert',
          status = 'ignored',
          request_id = null,
          last_http_status = null,
          last_error = null,
          response_body = null,
          next_attempt_at = now(),
          updated_at = now();
      return;
    end if;
  end if;

  insert into public.lifeos_sync_queue (
    trip_id,
    expense_id,
    external_expense_id,
    action,
    status,
    request_id,
    attempts,
    last_http_status,
    last_error,
    response_body,
    next_attempt_at,
    sent_at,
    updated_at
  )
  values (
    v_expense.trip_id,
    v_expense.id,
    v_expense.id,
    v_action,
    'pending',
    null,
    0,
    null,
    null,
    null,
    now(),
    null,
    now()
  )
  on conflict (external_expense_id) do update
  set trip_id = excluded.trip_id,
      expense_id = excluded.expense_id,
      action = excluded.action,
      status = 'pending',
      request_id = null,
      attempts = 0,
      last_http_status = null,
      last_error = null,
      response_body = null,
      next_attempt_at = now(),
      sent_at = null,
      updated_at = now();
end;
$$;

revoke all on function public.queue_lifeos_expense_sync(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_lifeos_expense_sync(uuid, text)
  to service_role;

create or replace function public.lifeos_sync_expense_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.queue_lifeos_expense_sync(
    new.id,
    case when new.archived_at is not null then 'cancel' else 'upsert' end
  );
  return new;
end;
$$;

create or replace function public.lifeos_sync_split_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  v_expense_id uuid;
begin
  if tg_op = 'DELETE' then
    v_expense_id := old.expense_id;
  else
    v_expense_id := new.expense_id;
  end if;

  perform public.queue_lifeos_expense_sync(v_expense_id, 'upsert');

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$;

create or replace function public.lifeos_sync_commitment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  v_expense_id uuid;
begin
  if tg_op = 'DELETE' then
    v_expense_id := old.source_expense_id;
  else
    v_expense_id := new.source_expense_id;
  end if;

  if v_expense_id is not null then
    perform public.queue_lifeos_expense_sync(v_expense_id, 'upsert');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$;

drop trigger if exists lifeos_sync_expense_after_change on public.expenses;
create trigger lifeos_sync_expense_after_change
after insert or update of
  title,
  amount,
  payer_user_id,
  payment_method,
  notes,
  archived_at
on public.expenses
for each row
execute function public.lifeos_sync_expense_trigger();

drop trigger if exists lifeos_sync_split_after_change on public.expense_splits;
create trigger lifeos_sync_split_after_change
after insert or update or delete on public.expense_splits
for each row
execute function public.lifeos_sync_split_trigger();

drop trigger if exists lifeos_sync_commitment_after_change on public.financial_commitments;
create trigger lifeos_sync_commitment_after_change
after insert or update or delete on public.financial_commitments
for each row
execute function public.lifeos_sync_commitment_trigger();

create or replace function public.dispatch_lifeos_sync_queue(
  p_limit integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public, net, vault, pg_temp
as $$
declare
  v_row public.lifeos_sync_queue%rowtype;
  v_payload jsonb;
  v_secret text;
  v_request_id bigint;
  v_dispatched integer := 0;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'lifeos_bridge_token'
  limit 1;

  if coalesce(v_secret, '') = '' then
    raise exception 'lifeos_bridge_token ausente no Vault.';
  end if;

  for v_row in
    select *
    from public.lifeos_sync_queue q
    where q.status in ('pending','error')
      and q.next_attempt_at <= now()
      and q.attempts < 6
    order by q.updated_at
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    v_payload := public.lifeos_bridge_payload(
      v_row.external_expense_id,
      v_row.action
    );

    if v_payload is null then
      update public.lifeos_sync_queue
      set status = 'error',
          last_error = 'Despesa de origem nao encontrada.',
          attempts = attempts + 1,
          next_attempt_at = now() + interval '30 minutes',
          updated_at = now()
      where id = v_row.id;
      continue;
    end if;

    select net.http_post(
      url := 'https://lifeos-6rib.onrender.com/api/integracoes/nordestrip/despesas',
      body := v_payload,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      timeout_milliseconds := 12000
    )
    into v_request_id;

    update public.lifeos_sync_queue
    set status = 'dispatched',
        request_id = v_request_id,
        attempts = attempts + 1,
        last_error = null,
        updated_at = now()
    where id = v_row.id;

    v_dispatched := v_dispatched + 1;
  end loop;

  return v_dispatched;
end;
$$;

create or replace function public.reconcile_lifeos_sync_queue()
returns integer
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
declare
  v_row public.lifeos_sync_queue%rowtype;
  v_response net._http_response%rowtype;
  v_done integer := 0;
begin
  for v_row in
    select *
    from public.lifeos_sync_queue q
    where q.status = 'dispatched'
      and q.request_id is not null
    order by q.updated_at
    limit 50
    for update skip locked
  loop
    select *
      into v_response
    from net._http_response r
    where r.id = v_row.request_id;

    if not found then
      continue;
    end if;

    if v_response.status_code between 200 and 299 then
      update public.lifeos_sync_queue
      set status = 'sent',
          last_http_status = v_response.status_code,
          response_body = v_response.content,
          last_error = null,
          sent_at = now(),
          request_id = null,
          updated_at = now()
      where id = v_row.id;
    elsif v_response.status_code = 409 then
      update public.lifeos_sync_queue
      set status = 'conflict',
          last_http_status = v_response.status_code,
          response_body = v_response.content,
          last_error = 'O LifeOS possui historico que impede atualizacao automatica.',
          request_id = null,
          updated_at = now()
      where id = v_row.id;
    else
      update public.lifeos_sync_queue
      set status = 'error',
          last_http_status = v_response.status_code,
          response_body = v_response.content,
          last_error = coalesce(
            nullif(v_response.error_msg, ''),
            'Falha HTTP ' || coalesce(v_response.status_code::text, 'sem status')
          ),
          request_id = null,
          next_attempt_at = now()
            + make_interval(mins => least(greatest(v_row.attempts * 2, 2), 30)),
          updated_at = now()
      where id = v_row.id;
    end if;

    v_done := v_done + 1;
  end loop;

  return v_done;
end;
$$;

create or replace function public.process_lifeos_sync_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reconciled integer;
  v_dispatched integer;
begin
  v_reconciled := public.reconcile_lifeos_sync_queue();
  v_dispatched := public.dispatch_lifeos_sync_queue(10);

  return jsonb_build_object(
    'reconciled', v_reconciled,
    'dispatched', v_dispatched,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.dispatch_lifeos_sync_queue(integer)
  from public, anon, authenticated;
revoke all on function public.reconcile_lifeos_sync_queue()
  from public, anon, authenticated;
revoke all on function public.process_lifeos_sync_queue()
  from public, anon, authenticated;

grant execute on function public.dispatch_lifeos_sync_queue(integer) to service_role;
grant execute on function public.reconcile_lifeos_sync_queue() to service_role;
grant execute on function public.process_lifeos_sync_queue() to service_role;

create or replace function public.retry_lifeos_expense_sync(
  p_expense_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trip_id uuid;
begin
  select e.trip_id
    into v_trip_id
  from public.expenses e
  where e.id = p_expense_id;

  if v_trip_id is null or not public.is_trip_member(v_trip_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  perform public.queue_lifeos_expense_sync(p_expense_id, 'upsert');
end;
$$;

revoke all on function public.retry_lifeos_expense_sync(uuid)
  from public, anon;
grant execute on function public.retry_lifeos_expense_sync(uuid)
  to authenticated;

do $$
begin
  perform cron.unschedule('nordestrip-lifeos-finance-sync');
exception when others then
  null;
end $$;

select cron.schedule(
  'nordestrip-lifeos-finance-sync',
  '* * * * *',
  'select public.process_lifeos_sync_queue();'
);
