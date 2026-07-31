-- ============================================================
-- MIGRAZIONE — Flag "Votata" sulle proposte
-- Esegui una volta nel SQL Editor di Supabase (Project > SQL Editor).
-- Aggiunge un flag booleano che SOLO l'admin può cambiare, per segnare
-- se una proposta è già stata portata a votazione o meno.
-- ============================================================

-- 1) Colonna di stato: false = non ancora votata, true = votata
alter table public.proposals
  add column if not exists voted boolean not null default false;

-- 2) Solo l'admin può cambiare il flag "voted".
--    L'autore può modificare titolo/testo della propria proposta, ma se
--    prova a toccare "voted" lo ricongeliamo al valore precedente.
create or replace function public.protect_proposal_flags()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.voted := old.voted;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_proposal_flags on public.proposals;
create trigger trg_protect_proposal_flags
  before update on public.proposals
  for each row execute function public.protect_proposal_flags();
