-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: advisor_assessments (Assessment de Maturidade, Parte A)
--
-- Baseline estruturado de maturidade por dominio (Dados, Cloud, IA, Seguranca,
-- Governanca), capturado incrementalmente nas conversas e/ou por formulario. As
-- pontuacoes e estagios passam a orientar as respostas do Advisor (contexto factual
-- do cliente, como o perfil ja entra).
--
-- RE-MEDICAO (versionamento): uma linha por MEDICAO. is_active marca a medicao
-- corrente (baseline vigente); version numera as medicoes do usuario. Justificativa
-- de guardar o historico em linhas versionadas em vez de sobrescrever: (a) permite
-- ver a evolucao da propria maturidade do cliente ao longo do tempo; (b) e o
-- substrato natural para a Parte B (cruzamento temporal com o arquivo), sem
-- remodelar nada. Um indice unico parcial garante no maximo UMA linha ativa por
-- usuario.
--
-- PARTE B (NAO implementada aqui): a coluna benchmark (jsonb, nullable) fica
-- RESERVADA para o veredito de atraso curado (estagio do cliente x ano em que aquilo
-- virou linha de base no mercado). Nesta Parte A ela nunca e preenchida nem lida.
--
-- Formato de answers (jsonb): { "<question_id>": { "level": 1..4, "origin":
--   "conversation"|"form", "at": "<iso timestamp>" } }.
-- Formato de scores (jsonb): { "<domain_id>": <0..100> } (so dominios com nota; a
--   regra de nota vive em lib/assessment-model.ts: media dos niveis x 25, minimo 3 de 4).
--
-- Idempotente. Rodar manualmente no Supabase SQL Editor. NAO executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.advisor_assessments (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.users(id) on delete cascade,
  answers           jsonb       not null default '{}'::jsonb,
  scores            jsonb       not null default '{}'::jsonb,
  completed_domains text[]      not null default '{}',
  status            text        not null default 'in_progress' check (status in ('in_progress', 'complete')),
  -- Versionamento de re-medicao.
  is_active         boolean     not null default true,
  version           int         not null default 1,
  -- RESERVADO para a Parte B (veredito de atraso curado). Nao usado na Parte A.
  benchmark         jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_advisor_assessments_user on public.advisor_assessments (user_id);
-- No maximo UMA medicao ativa por usuario (o baseline vigente).
create unique index if not exists idx_advisor_assessments_active
  on public.advisor_assessments (user_id) where is_active;

-- ── RLS: usuario gerencia a propria medicao ──────────────────────────────────
alter table public.advisor_assessments enable row level security;
drop policy if exists "Users manage own assessments" on public.advisor_assessments;
create policy "Users manage own assessments"
  on public.advisor_assessments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── updated_at automatico (reusa a funcao ja definida no projeto) ─────────────
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_advisor_assessments_updated_at on public.advisor_assessments;
create trigger trg_advisor_assessments_updated_at
  before update on public.advisor_assessments
  for each row execute function public.update_updated_at_column();
