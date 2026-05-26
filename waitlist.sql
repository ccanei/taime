-- Waitlist — lista de espera para acesso antecipado ao TAIME
-- Execute no Supabase SQL Editor

create table if not exists waitlist (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null unique,
  name       text,
  company    text,
  role       text,
  interest   text,
  created_at timestamptz default now(),
  contacted  boolean     default false
);

-- RLS: permite inserção anônima, leitura apenas via service_role
alter table waitlist enable row level security;

create policy "waitlist_anon_insert" on waitlist
  for insert with check (true);

-- Apenas service_role lê (via painel Supabase ou scripts internos)
-- Sem policy de SELECT = ninguém via anon key consegue listar emails

create index if not exists waitlist_email_idx on waitlist (email);

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: se a tabela já existir com o schema antigo (só email + contacted),
-- rode os comandos abaixo para adicionar as novas colunas:
-- ─────────────────────────────────────────────────────────────────────────────

-- alter table waitlist
--   add column if not exists name     text,
--   add column if not exists company  text,
--   add column if not exists role     text,
--   add column if not exists interest text;
