-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: advisor_alerts (Fase 3.1 - alertas por EVENTO do Advisor)
--
-- O produto volta ao cliente quando algo REALMENTE muda no que ele acompanha. NAO
-- e newsletter nem lembrete recorrente: cada email precisa justificar a abertura.
-- Dois tipos de evento:
--   'new_signal'     -> saiu uma analise (trend publicada e indexada) semanticamente
--                       proxima ao TEMA de um plano ativo do usuario.
--   'stalled_action' -> acao pendente na fase atual de um plano parada ha N dias.
--
-- Preferencias de notificacao: COLUNAS em public.users (nao tabela propria). Justificativa:
-- as preferencias sao estritamente 1:1 com o usuario, minusculas e a linha de users ja
-- e carregada nos contextos de conta e de email; uma tabela a parte so adicionaria um
-- join sem beneficio. Defaults: new_signal OPT-IN (e valor), stalled_action OPT-OUT
-- (e cobranca), alem de uma chave global "nao enviar nada" (alerts_muted).
--
-- Idempotente: pode rodar mais de uma vez. Valida contra o schema real (users,
-- advisor_plans, report_trend_embeddings, reports ja existem).
-- Rodar manualmente no Supabase SQL Editor. NAO e executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela de alertas ─────────────────────────────────────────────────────
create table if not exists public.advisor_alerts (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  -- Plano de origem (quando aplicavel). Nullable: um evento pode nao ligar a um plano.
  plan_id    uuid        references public.advisor_plans(id) on delete cascade,
  type       text        not null check (type in ('new_signal', 'stalled_action')),
  -- O que disparou (auditoria):
  --   new_signal:     { theme, trend_id, report_id, rank, period, theme_slug, category,
  --                     similarity, phase_index, phase_label }
  --   stalled_action: { plan_id, phase_index, phase_label, action_index, action_text,
  --                     days_stalled }
  payload    jsonb       not null default '{}'::jsonb,
  status     text        not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  -- Chave de deduplicacao para idempotencia FORTE do new_signal (1 alerta por
  -- (user, trend)). stalled_action deixa NULL e usa a regra de escalonamento (30 dias)
  -- no proprio job. Ver indice unico parcial abaixo.
  dedup_key  text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_advisor_alerts_user        on public.advisor_alerts (user_id);
create index if not exists idx_advisor_alerts_status       on public.advisor_alerts (status);
create index if not exists idx_advisor_alerts_user_type    on public.advisor_alerts (user_id, type);
-- Idempotencia forte: no maximo 1 alerta por (user, dedup_key) quando a chave existe.
create unique index if not exists idx_advisor_alerts_dedup on public.advisor_alerts (user_id, dedup_key) where dedup_key is not null;

-- RLS: usuario le apenas os proprios alertas; o backend (job) usa a service key, que
-- BYPASSA RLS (nao precisa de policy de insert/update).
alter table public.advisor_alerts enable row level security;
drop policy if exists "Users read own advisor alerts" on public.advisor_alerts;
create policy "Users read own advisor alerts"
  on public.advisor_alerts for select
  using (auth.uid() = user_id);

-- ── 2. Preferencias de notificacao (colunas em users) ────────────────────────
--   alert_new_signal     -> OPT-IN  por padrao (o valor: uma analise nova toca o plano)
--   alert_stalled_action -> OPT-OUT por padrao (a cobranca: acao parada)
--   alerts_muted         -> chave global "nao enviar nada" (tem precedencia)
--   alert_optout_token   -> token estavel para opt-out publico em 1 clique, sem login.
--     Default volatil (gen_random_uuid) => cada linha existente recebe um token unico
--     no ADD COLUMN (Postgres reescreve a tabela e avalia o default por linha).
alter table public.users add column if not exists alert_new_signal     boolean not null default true;
alter table public.users add column if not exists alert_stalled_action boolean not null default false;
alter table public.users add column if not exists alerts_muted         boolean not null default false;
alter table public.users add column if not exists alert_optout_token   uuid    not null default gen_random_uuid();

-- ── 3. RPC de deteccao semantica do 'new_signal' ─────────────────────────────
-- Igual espirito de match_trend_chunks (cosine sobre report_trend_embeddings), mas
-- para o job: filtra por JANELA de indexacao (created_at >= since_ts, "desde o ultimo
-- alerta / criacao do plano"), por idioma do usuario, e por LIMIAR de similaridade
-- (conservador: melhor nao alertar do que alertar por casamento fraco). So trends de
-- relatorios publicados. Devolve indexed_at para auditoria.
create or replace function public.match_trend_chunks_since(
  query_embedding vector(1536),
  since_ts        timestamptz,
  match_lang      text,
  min_similarity  float default 0.40,
  match_count     int   default 20
)
returns table (
  trend_id   uuid,
  report_id  uuid,
  period     date,
  rank       smallint,
  theme_slug text,
  category   text,
  content    text,
  indexed_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    e.trend_id, e.report_id, e.period, e.rank, e.theme_slug, e.category, e.content,
    e.created_at as indexed_at,
    1 - (e.embedding <=> query_embedding) as similarity
  from report_trend_embeddings e
  join reports r on r.id = e.report_id and r.status = 'published'
  where e.embedding is not null
    and e.created_at >= since_ts
    and e.lang = match_lang
    and (1 - (e.embedding <=> query_embedding)) >= min_similarity
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
