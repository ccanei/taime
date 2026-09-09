-- ============================================================================
-- decision_checks: submissoes do /decision-check (isca de leads publica, gratuita).
--
-- Cada submissao do formulario de 4 perguntas vira 1 linha: tema, porte, objetivo,
-- horizonte, o snapshot do resultado (score/move/then-now-next/risco) em jsonb, e o
-- hash do IP (nunca o IP cru) para rate limit e analytics. Sem PII.
--
-- RLS on, SEM policy: nega anon/authenticated; acesso so via service key server-side
-- (mesmo padrao das demais tabelas de backend do produto).
--
-- Rate limit: contagem por ip_hash na ultima hora (indice ip_hash+created_at).
-- Analytics/cockpit: submissoes por dia e temas mais buscados (indices theme/created).
--
-- Rodar uma vez no SQL editor do Supabase.
-- ============================================================================

create table if not exists public.decision_checks (
  id               uuid        primary key default gen_random_uuid(),
  theme_slug       text        not null,
  org_size         text        not null,
  objective        text        not null,
  horizon          text        not null,
  result_snapshot  jsonb,
  ip_hash          text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_decision_checks_theme      on public.decision_checks (theme_slug);
create index if not exists idx_decision_checks_created     on public.decision_checks (created_at desc);
create index if not exists idx_decision_checks_ip_created  on public.decision_checks (ip_hash, created_at desc);

alter table public.decision_checks enable row level security;
