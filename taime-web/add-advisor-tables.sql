-- TAIME — Advisor tables
-- Run this in the Supabase SQL Editor

-- ── advisor_profiles ──────────────────────────────────────────────────────────
create table if not exists advisor_profiles (
  id                     uuid default gen_random_uuid() primary key,
  user_id                uuid references auth.users(id) on delete cascade unique not null,
  company_name           text,
  sector                 text,
  company_size           text,
  annual_revenue         text,
  current_infrastructure text,
  strategic_objective    text,
  maturity_level         text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table advisor_profiles enable row level security;

-- Users can only see/edit their own profile
create policy "Users manage own advisor profile"
  on advisor_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── advisory_memory ───────────────────────────────────────────────────────────
-- Create only if it doesn't exist yet
create table if not exists advisory_memory (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  session_id       uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  context_metadata jsonb default '{}',
  created_at       timestamptz default now()
);

alter table advisory_memory enable row level security;

create policy "Users manage own advisory memory"
  on advisory_memory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for efficient loading of conversation history
create index if not exists advisory_memory_user_session_idx
  on advisory_memory (user_id, session_id, created_at desc);

create index if not exists advisory_memory_user_created_idx
  on advisory_memory (user_id, created_at desc);

-- Auto-update updated_at on advisor_profiles
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists advisor_profiles_updated_at on advisor_profiles;
create trigger advisor_profiles_updated_at
  before update on advisor_profiles
  for each row execute function update_updated_at_column();
