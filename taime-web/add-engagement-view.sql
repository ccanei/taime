-- ============================================================================
-- TAIME · Engajamento por usuário (painel /admin/engagement)
-- ----------------------------------------------------------------------------
-- Entregue PRONTO. NÃO executar automaticamente: rode manualmente no Supabase
-- SQL editor quando quiser ativar o painel.
--
-- Não cria tracking novo: apenas agrega o que já existe em reading_progress
-- e advisory_memory. Resultado: 1 linha por (usuário, mês) com métricas de uso
-- e custo do Advisor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- saved_reports: placeholder.
-- Esta tabela AINDA NÃO EXISTE no schema. A spec do painel assume um recurso
-- de "salvar relatório" (bookmark) que ainda não foi construído. Criamos a
-- tabela vazia aqui para a view ser auto-contida e executável; enquanto não
-- houver feature de bookmark, reports_saved será sempre 0.
-- ----------------------------------------------------------------------------
create table if not exists saved_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  report_id   bigint,
  created_at  timestamptz not null default now(),
  unique (user_id, report_id)
);

-- ----------------------------------------------------------------------------
-- View agregada: user_engagement_monthly
-- ----------------------------------------------------------------------------
create or replace view user_engagement_monthly as
with
-- Relatórios abertos / concluídos, bucketizados pelo mês da 1ª leitura.
rp as (
  select
    user_id,
    date_trunc('month', first_read_at)              as month,
    count(*)                                         as reports_opened,
    count(*) filter (where completed)               as reports_completed,
    max(last_read_at)                               as last_activity_at
  from reading_progress
  where first_read_at is not null
  group by user_id, date_trunc('month', first_read_at)
),
-- Relatórios salvos (bookmark): hoje sempre vazio (ver placeholder acima).
sr as (
  select
    user_id,
    date_trunc('month', created_at)                 as month,
    count(*)                                         as reports_saved,
    max(created_at)                                 as last_activity_at
  from saved_reports
  group by user_id, date_trunc('month', created_at)
),
-- Mensagens do usuário ao Advisor (só role='user').
am_user as (
  select
    user_id,
    date_trunc('month', created_at)                 as month,
    count(*)                                         as advisor_messages,
    max(created_at)                                 as last_activity_at
  from advisory_memory
  where role = 'user'
  group by user_id, date_trunc('month', created_at)
),
-- Custo do Advisor: tokens do usage só das respostas (role='assistant').
-- O usage é gravado em AMBAS as linhas (user e assistant) da mesma troca,
-- então somar só assistant evita contagem dobrada.
am_cost as (
  select
    user_id,
    date_trunc('month', created_at)                                       as month,
    coalesce(sum((context_metadata->'usage'->>'input_tokens')::bigint), 0)  as advisor_input_tokens,
    coalesce(sum((context_metadata->'usage'->>'output_tokens')::bigint), 0) as advisor_output_tokens
  from advisory_memory
  where role = 'assistant'
    and context_metadata ? 'usage'
  group by user_id, date_trunc('month', created_at)
),
-- Chaves (user_id, month) de todas as fontes.
keys as (
  select user_id, month from rp
  union
  select user_id, month from sr
  union
  select user_id, month from am_user
  union
  select user_id, month from am_cost
)
select
  k.user_id,
  k.month,
  u.email,
  u.full_name,
  s.plan,
  coalesce(rp.reports_opened, 0)                          as reports_opened,
  coalesce(rp.reports_completed, 0)                       as reports_completed,
  coalesce(sr.reports_saved, 0)                           as reports_saved,
  coalesce(am_user.advisor_messages, 0)                   as advisor_messages,
  coalesce(am_cost.advisor_input_tokens, 0)               as advisor_input_tokens,
  coalesce(am_cost.advisor_output_tokens, 0)              as advisor_output_tokens,
  -- soma input+output (combinado, como na spec)
  coalesce(am_cost.advisor_input_tokens, 0)
    + coalesce(am_cost.advisor_output_tokens, 0)          as advisor_cost_tokens,
  -- última atividade no mês: maior timestamp entre todas as fontes.
  -- GREATEST ignora NULLs no Postgres.
  greatest(rp.last_activity_at, sr.last_activity_at, am_user.last_activity_at)
                                                          as last_activity_at
from keys k
left join rp      on rp.user_id      = k.user_id and rp.month      = k.month
left join sr      on sr.user_id      = k.user_id and sr.month      = k.month
left join am_user on am_user.user_id = k.user_id and am_user.month = k.month
left join am_cost on am_cost.user_id = k.user_id and am_cost.month = k.month
left join users u on u.id = k.user_id
left join lateral (
  select plan
  from subscriptions
  where subscriptions.user_id = k.user_id
    and status = 'active'
  order by created_at desc
  limit 1
) s on true;

-- Leitura sugerida pelo painel (últimos meses, mais recentes primeiro):
--   select * from user_engagement_monthly order by last_activity_at desc nulls last;
