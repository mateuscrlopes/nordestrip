-- Nordestrip — arquivamento coerente de compras de cartão pessoal
-- Arquivar uma despesa deve remover também suas parcelas futuras das visões financeiras.

create or replace function public.sync_expense_commitment_archive()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    update public.financial_commitments
    set archived_at = new.archived_at,
        updated_at = now()
    where source_expense_id = new.id
      and source = 'manual_personal_card'
      and commitment_kind = 'personal_card';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_expense_commitment_archive_trigger
  on public.expenses;

create trigger sync_expense_commitment_archive_trigger
after update of archived_at on public.expenses
for each row
execute function public.sync_expense_commitment_archive();

-- Corrige registros já arquivados antes desta regra.
update public.financial_commitments fc
set archived_at = e.archived_at,
    updated_at = now()
from public.expenses e
where fc.source_expense_id = e.id
  and fc.source = 'manual_personal_card'
  and fc.commitment_kind = 'personal_card'
  and e.archived_at is not null
  and fc.archived_at is null;

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
left join public.expenses e on e.id = fc.source_expense_id
where fc.commitment_kind = 'personal_card'
  and fc.archived_at is null
  and fc.lifecycle_status not in ('paid', 'cancelled')
  and (fc.source_expense_id is null or e.archived_at is null);

alter view public.v_trip_personal_card_commitments set (security_invoker = true);
grant select on public.v_trip_personal_card_commitments to authenticated;
