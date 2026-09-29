-- Rode este script no Supabase: SQL Editor > New query > Run

create table if not exists public.patients (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadastros (
  id         text primary key,          -- usamos 'main' (especialidades e médicos)
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Segurança: só usuários LOGADOS acessam. Sem login, nada é lido nem gravado.
alter table public.patients  enable row level security;
alter table public.cadastros enable row level security;

drop policy if exists "auth_all_patients"  on public.patients;
drop policy if exists "auth_all_cadastros" on public.cadastros;

create policy "auth_all_patients"  on public.patients
  for all to authenticated using (true) with check (true);
create policy "auth_all_cadastros" on public.cadastros
  for all to authenticated using (true) with check (true);

-- Atualização em tempo real entre dispositivos
alter publication supabase_realtime add table public.patients;
alter publication supabase_realtime add table public.cadastros;
