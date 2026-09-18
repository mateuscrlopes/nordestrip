-- Nordestrip — ponte Open Finance para o LifeOS.
-- O LifeOS reutiliza as conexoes Meu Pluggy ja existentes sem receber
-- client secret, API key ou outros segredos da Pluggy.

create table if not exists public.lifeos_identity_links (
  lifeos_user_id uuid primary key,
  nordestrip_user_id uuid not null unique references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lifeos_identity_links enable row level security;
revoke all on public.lifeos_identity_links from public, anon, authenticated;
grant select, insert, update, delete on public.lifeos_identity_links to service_role;

insert into public.lifeos_identity_links (lifeos_user_id, nordestrip_user_id, active, updated_at)
values
  ('f0e8537d-7761-43b5-aa55-4eda87919084'::uuid, '5e2bafb7-d6ef-4fe4-8d73-a4f2c37567bf'::uuid, true, now()),
  ('c196b1eb-e665-41b1-b2ee-af20672aece0'::uuid, '059c34d6-bcf7-4ec4-b1d8-e5fb111a3092'::uuid, true, now())
on conflict (lifeos_user_id) do update
set nordestrip_user_id = excluded.nordestrip_user_id,
    active = true,
    updated_at = now();

create or replace function public.lifeos_open_finance_context(
  p_lifeos_user_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_authorized boolean := false;
  v_user_id uuid;
  v_items jsonb;
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

  select l.nordestrip_user_id
    into v_user_id
  from public.lifeos_identity_links l
  where l.lifeos_user_id = p_lifeos_user_id
    and l.active = true;

  if v_user_id is null then
    return jsonb_build_object(
      'status', 'not_mapped',
      'item_ids', '[]'::jsonb
    );
  end if;

  with connections as (
    select external_connection_id, metadata
    from public.integration_connections
    where owner_user_id = v_user_id
      and provider = 'pluggy'
      and purpose = 'open_finance'
      and archived_at is null
  ),
  item_ids as (
    select nullif(trim(external_connection_id), '') as id
    from connections
    where external_connection_id is not null

    union

    select nullif(trim(item->>'id'), '') as id
    from connections,
      lateral jsonb_array_elements(
        case
          when jsonb_typeof(metadata->'items') = 'array' then metadata->'items'
          else '[]'::jsonb
        end
      ) as item
  )
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
    into v_items
  from item_ids
  where id is not null;

  return jsonb_build_object(
    'status', 'ok',
    'nordestrip_user_id', v_user_id,
    'item_ids', v_items
  );
end;
$$;

revoke all on function public.lifeos_open_finance_context(uuid, text)
  from public, authenticated;
grant execute on function public.lifeos_open_finance_context(uuid, text)
  to anon, service_role;
