-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: advisor_company_facts (Memoria livre da empresa)
--
-- Camada de memoria LIVRE sobre a empresa do cliente, capturada incrementalmente
-- das conversas (Haiku, fora do caminho critico) e/ou adicionada manualmente pelo
-- cliente. Complementa advisor_profiles (perfil estruturado) e advisor_assessments
-- (maturidade por dominio): aqui ficam fatos ricos que o cliente revela na conversa
-- ("usam Salesforce para CRM", "projeto de data lake parado ha 6 meses", "o board
-- aprovou budget para IA"). Os fatos ativos entram no contexto do Advisor, agrupados
-- por categoria, do mesmo modo que o perfil e o assessment ja entram.
--
-- is_active: o cliente pode DESATIVAR um fato incorreto sem apaga-lo (auditoria e
-- possibilidade de reativar). Fatos inativos nunca entram no contexto do Advisor.
--
-- source: 'conversation' (extraido automaticamente do turno do usuario) ou 'manual'
-- (adicionado pelo cliente no painel). confidence: 'high' para afirmacoes diretas,
-- 'medium' para implicitas.
--
-- Idempotente. Rodar manualmente no Supabase SQL Editor. NAO executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.advisor_company_facts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  category    text        not null check (category in (
                'technology', 'system', 'project', 'priority',
                'constraint', 'decision', 'budget', 'other')),
  fact        text        not null,
  source      text        not null default 'conversation' check (source in ('conversation', 'manual')),
  confidence  text        not null default 'high' check (confidence in ('high', 'medium')),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_advisor_company_facts_user
  on public.advisor_company_facts (user_id);
create index if not exists idx_advisor_company_facts_user_category
  on public.advisor_company_facts (user_id, category);

-- ── RLS: cada usuario gerencia apenas os proprios fatos ──────────────────────
alter table public.advisor_company_facts enable row level security;
drop policy if exists "Users manage own company facts" on public.advisor_company_facts;
create policy "Users manage own company facts"
  on public.advisor_company_facts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── updated_at automatico ────────────────────────────────────────────────────
-- REUSA a funcao public.update_updated_at_column() ja definida no projeto (ver
-- add-advisor-assessments.sql, add-advisor-plans.sql, etc.). NAO recriada aqui de
-- proposito: e ponto unico de verdade. So o trigger e criado.
drop trigger if exists trg_advisor_company_facts_updated_at on public.advisor_company_facts;
create trigger trg_advisor_company_facts_updated_at
  before update on public.advisor_company_facts
  for each row execute function public.update_updated_at_column();
