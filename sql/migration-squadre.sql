-- ============================================================
-- MIGRAZIONE — Tab "Squadre" ed "eliminazione" (soft) delle squadre
-- Esegui una volta nel SQL Editor di Supabase (Project > SQL Editor).
-- Non cancella dati: marca la squadra come rimossa così non può più loggarsi,
-- ma proposte e voti restano.
-- ============================================================

-- 1) Colonna per marcare una squadra come rimossa
alter table public.profiles
  add column if not exists disabled boolean not null default false;

-- 2) L'admin può aggiornare qualsiasi profilo (per rimuovere una squadra)
drop policy if exists "admin aggiorna qualsiasi profilo (rimozione squadra)" on public.profiles;
create policy "admin aggiorna qualsiasi profilo (rimozione squadra)"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3) Un non-admin non può cambiare i propri flag disabled / is_admin
--    (può solo rinominare la propria squadra)
create or replace function public.protect_profile_flags()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.disabled := old.disabled;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_flags on public.profiles;
create trigger trg_protect_profile_flags
  before update on public.profiles
  for each row execute function public.protect_profile_flags();
