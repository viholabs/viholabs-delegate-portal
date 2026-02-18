/**
 * VIHOLABS — HOLDed Incremental Sync State
 * Purpose: Persist a single global cursor for incremental ingestion (no UI).
 * Canon: infra-only, deterministic, idempotent.
 */

create table if not exists public.holded_sync_state (
  id boolean primary key default true,
  last_sync_at timestamptz not null,
  last_cursor text null,
  updated_at timestamptz not null default now()
);

create or replace function public.holded_sync_state_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holded_sync_state_touch on public.holded_sync_state;
create trigger trg_holded_sync_state_touch
before update on public.holded_sync_state
for each row execute function public.holded_sync_state_touch();
