-- Nordestrip — credencial e endpoint lógico para arquivamento iniciado pelo LifeOS.
-- O LifeOS só pode arquivar despesas que já fizeram parte da ponte financeira.

create table if not exists public.external_integration_tokens (
  id uuid primary key default gen_random_uuid(),
  origin text not null unique,
  token_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_integration_tokens enable row level security;
revoke all on public.external_integration_tokens from anon, authenticated;
grant select, insert, update, delete on public.external_integration_tokens to service_role;

insert into public.external_integration_tokens (
  origin,
  token_hash,
  active,
  updated_at
)
values (
  'lifeos',
  'cd8f0aa61fdab09c1c9618263d88460adb5b9b08d2cb4a89cc594250176a0a22',
  true,
  now()
)
on conflict (origin) do update
set token_hash = excluded.token_hash,
    active = true,
    updated_at = now();

create or replace function public.archive_expense_from_lifeos(
  p_expense_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_expense public.expenses%rowtype;
  v_authorized boolean;
begin
  select exists (
    select 1
    from public.external_integration_tokens t
    where t.origin = 'lifeos'
      and t.active = true
      and t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  )
  into v_authorized;

  if not v_authorized then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select *
    into v_expense
  from public.expenses e
  where e.id = p_expense_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'expense_id', p_expense_id
    );
  end if;

  if not exists (
    select 1
    from public.lifeos_sync_queue q
    where q.external_expense_id = v_expense.id
  ) then
    return jsonb_build_object(
      'status', 'conflict',
      'reason', 'expense_not_managed_by_lifeos_bridge',
      'expense_id', v_expense.id
    );
  end if;

  if v_expense.archived_at is not null then
    return jsonb_build_object(
      'status', 'unchanged',
      'expense_id', v_expense.id,
      'archived_at', v_expense.archived_at
    );
  end if;

  update public.expenses
  set archived_at = now(),
      updated_at = now()
  where id = v_expense.id;

  return jsonb_build_object(
    'status', 'archived',
    'expense_id', v_expense.id
  );
end;
$$;

revoke all on function public.archive_expense_from_lifeos(uuid, text)
  from public, authenticated;
grant execute on function public.archive_expense_from_lifeos(uuid, text)
  to anon, service_role;
