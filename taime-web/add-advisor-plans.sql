-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: advisor_plans (Fase 2.1 do roadmap salvo do Advisor)
--
-- Persiste o roadmap estrategico que o Advisor entrega (fases, acoes, o que nao
-- fazer, criterio de saida) como um objeto salvo do cliente. So persistencia e
-- captura nesta fase; a UI de visualizacao (2.2) e a atualizacao conversacional
-- (2.3) vem depois.
--
-- Segue o padrao das tabelas existentes:
--   - user_id FK public.users(id) ON DELETE CASCADE (como advisor_sessions).
--   - session_id uuid, SEM FK (mesmo padrao de advisory_memory.session_id, que
--     agrupa mensagens de uma sessao mas nao e PK de outra tabela referenciavel).
--   - RLS: usuario le/edita apenas os proprios planos; o backend usa a service key
--     (service_role BYPASSA RLS, entao nao precisa de policy propria).
--   - updated_at automatico via trigger (mesma funcao update_updated_at_column
--     usada por advisor_profiles).
--
-- Formato de phases (jsonb): array de fases, cada uma:
--   {
--     "label": "Fase 1: Fundacao (0-3 meses)",   // rotulo + horizonte
--     "actions": [ { "text": "...", "status": "todo" } ],  // status por item: todo|doing|done
--     "avoid": [ "...", "..." ],                  // o que NAO fazer
--     "exitCriteria": "..."                        // criterio de saida
--   }
--
-- Rodar manualmente no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.advisor_plans (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.users(id) on delete cascade,
  -- Identificador da sessao do Advisor que originou o plano (mesmo padrao de
  -- advisory_memory.session_id). Sem FK: session_id nao e PK de advisory_memory.
  session_id        uuid        not null,
  title             text,
  -- Tema principal do plano (ex: "agentes de IA em atendimento"). Usado para
  -- detectar plano ativo do mesmo tema (substituir vs criar novo).
  theme             text,
  phases            jsonb       not null default '[]'::jsonb,
  status            text        not null default 'active'
                      check (status in ('active', 'archived', 'completed')),
  -- Referencia (best-effort) a mensagem do assistant que originou o plano.
  -- Sem FK: o id da mensagem no cliente pode diferir do row em advisory_memory.
  source_message_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_advisor_plans_user
  on public.advisor_plans (user_id);

create index if not exists idx_advisor_plans_user_status
  on public.advisor_plans (user_id, status);

-- ── RLS: usuario gerencia apenas os proprios planos ──────────────────────────
alter table public.advisor_plans enable row level security;

create policy "Users manage own advisor plans"
  on public.advisor_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── updated_at automatico (recria a funcao para a migration ser auto-contida) ──
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_advisor_plans_updated_at on public.advisor_plans;
create trigger trg_advisor_plans_updated_at
  before update on public.advisor_plans
  for each row execute function public.update_updated_at_column();
