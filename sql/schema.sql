-- ============================================================
-- SERIE A TEEN — Schema Supabase
-- Esegui questo file nell'editor SQL di Supabase (Project > SQL Editor)
-- ============================================================

-- ------------------------------------------------------------
-- PROFILI (una riga per ogni utente di auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  team_name   text not null,
  is_admin    boolean not null default false,
  disabled    boolean not null default false,  -- squadra "rimossa": non può più loggarsi (dati conservati)
  created_at  timestamptz not null default now()
);

-- Alla registrazione crea in automatico il profilo.
-- Il nome società arriva dai metadati dell'utente (team_name).
-- SPORTING BUBA viene marcato admin in automatico.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, team_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'team_name', 'Società'),
    upper(coalesce(new.raw_user_meta_data->>'team_name','')) = 'SPORTING BUBA'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: true se l'utente corrente è admin
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Un non-admin può rinominare la propria squadra, ma NON può cambiare
-- i flag disabled / is_admin (li congeliamo ai valori precedenti).
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

-- ------------------------------------------------------------
-- VOTAZIONI
-- ------------------------------------------------------------
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'open' check (status in ('open','archived')),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls(id) on delete cascade,
  label     text not null,
  position  int not null default 0
);

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls(id) on delete cascade,
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)   -- un voto per votazione per presidente
);

-- ------------------------------------------------------------
-- PROPOSTE (stile blog)
-- ------------------------------------------------------------
create table if not exists public.proposals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes        enable row level security;
alter table public.proposals    enable row level security;

-- ---- PROFILES ----
create policy "profili leggibili da tutti gli autenticati"
  on public.profiles for select to authenticated using (true);

create policy "aggiorno solo il mio profilo (nome società)"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "admin aggiorna qualsiasi profilo (rimozione squadra)"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- POLLS ----
create policy "votazioni leggibili da tutti gli autenticati"
  on public.polls for select to authenticated using (true);

create policy "solo admin crea votazioni"
  on public.polls for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "solo admin modifica/archivia votazioni"
  on public.polls for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "solo admin elimina votazioni"
  on public.polls for delete to authenticated
  using (public.is_admin());

-- ---- POLL OPTIONS ----
create policy "opzioni leggibili da tutti gli autenticati"
  on public.poll_options for select to authenticated using (true);

create policy "solo admin gestisce le opzioni"
  on public.poll_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- VOTES ----
create policy "i voti sono leggibili da tutti gli autenticati"
  on public.votes for select to authenticated using (true);

create policy "voto solo se la votazione è aperta e voto per me"
  on public.votes for insert to authenticated
  with check (
    voter_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and p.status = 'open')
  );

create policy "posso cambiare il mio voto se la votazione è aperta"
  on public.votes for update to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and p.status = 'open')
  );

create policy "posso ritirare il mio voto se la votazione è aperta"
  on public.votes for delete to authenticated
  using (
    voter_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and p.status = 'open')
  );

-- ---- PROPOSALS ----
create policy "proposte leggibili da tutti gli autenticati"
  on public.proposals for select to authenticated using (true);

create policy "ogni presidente crea le proprie proposte"
  on public.proposals for insert to authenticated
  with check (author_id = auth.uid());

create policy "modifica solo autore o admin"
  on public.proposals for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "elimina solo autore o admin"
  on public.proposals for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- VISTA comoda: conteggio voti per opzione
-- ------------------------------------------------------------
create or replace view public.poll_results as
  select o.id as option_id, o.poll_id, o.label, o.position,
         count(v.id) as vote_count
  from public.poll_options o
  left join public.votes v on v.option_id = o.id
  group by o.id, o.poll_id, o.label, o.position;
