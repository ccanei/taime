-- admins — controle de acesso ao painel admin do TAIME
-- Execute no Supabase SQL Editor

create table if not exists admins (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null unique,
  created_at timestamptz default now()
);

-- RLS: apenas service_role acessa (sem policy SELECT = anon não lê)
alter table admins enable row level security;

-- Admin inicial
insert into admins (email)
values ('claudineicanei1@gmail.com')
on conflict (email) do nothing;
