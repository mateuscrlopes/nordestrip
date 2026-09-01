drop trigger if exists sync_reservation_financial_commitments_trigger
  on public.reservations;
drop trigger if exists cleanup_reservation_financial_commitments_trigger
  on public.reservations;

create trigger sync_reservation_financial_commitments_trigger
after insert or update on public.reservations
for each row
execute function public.sync_reservation_financial_commitments();

create or replace function public.cleanup_reservation_financial_commitments()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.financial_commitments
  where reservation_id = old.id
    and source = 'reservation_auto';
  return old;
end;
$$;

create trigger cleanup_reservation_financial_commitments_trigger
before delete on public.reservations
for each row
execute function public.cleanup_reservation_financial_commitments();
