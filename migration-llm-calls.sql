-- ============================================================================
-- Migration: llm_calls (telemetria minima de chamadas LLM)
-- Aplicar MANUALMENTE no Supabase (SQL Editor). Idempotente.
--
-- Proposito: unit economics (custo por dia/caller/user), diagnostico de
-- incidentes (latencia, taxa de erro) e analise de variancia do judge.
-- Filosofia: fire-and-forget. Sem FKs rigidas (telemetria nao pode falhar por
-- integridade referencial). RLS ligado sem policy: so a service key escreve/le.
-- ============================================================================

-- uuid_generate_v4() vem da extensao uuid-ossp. Idempotente; no-op se ja existir.
create extension if not exists "uuid-ossp";

create table if not exists public.llm_calls (
  id                 uuid        primary key default uuid_generate_v4(),
  created_at         timestamptz not null    default now(),
  caller             text        not null,   -- collect|filter|analyze|generate|validate|advisor|ask|regen|...
  model              text        not null,
  input_tokens       int,
  output_tokens      int,
  cache_read_tokens  int,
  cache_write_tokens int,
  latency_ms         int,
  success            boolean     not null    default true,
  error_code         text,
  period             text,                    -- periodo do pipeline (YYYY-MM-DD) quando aplicavel
  report_id          uuid,                    -- SEM FK (telemetria nao bloqueia por integridade)
  user_id            uuid,                    -- SEM FK
  request_id         text,
  meta               jsonb
);

-- Indices para as consultas de custo/latencia/erro.
create index if not exists llm_calls_created_at_idx on public.llm_calls (created_at desc);
create index if not exists llm_calls_caller_idx     on public.llm_calls (caller);
create index if not exists llm_calls_period_idx     on public.llm_calls (period);

-- RLS ligado, SEM policy: a service key bypassa RLS; qualquer outra chave nao le nem escreve.
alter table public.llm_calls enable row level security;

comment on table public.llm_calls is
  'Telemetria de chamadas LLM (fire-and-forget). Sem FKs. So service key (RLS on, no policy).';
