-- TAIME, Advisor session metadata + 90-day archive
-- Entregue pronto. NÃO executar automaticamente; rodar no SQL editor do Supabase.
--
-- Por que uma tabela nova em vez de uma coluna em advisory_memory:
--   - Lista de sessões vira leitura simples (1 row por sessão) em vez de
--     GROUP BY pesado em advisory_memory.
--   - Arquivar/desarquivar é UPDATE de 1 linha (não N).
--   - advisory_memory continua como log imutável de mensagens.
--   - Substrato natural para a fase futura (resumo + pgvector): cabem aqui
--     como colunas adicionais sem mexer na tabela de mensagens.
--
-- Regra de archive (não destrutiva):
--   archived_at IS NOT NULL  → arquivamento explícito (futuro)
--   last_activity_at < now() - interval '90 days' → arquivamento por inatividade
-- A lista padrão (Tarefa 1) exclui ambos os casos. A aba "arquivadas" inclui
-- ambos. NUNCA apagamos mensagens; archive só remove da vista principal.

-- ── 1. Tabela ─────────────────────────────────────────────────────────────────

create table if not exists advisor_sessions (
  session_id        uuid        primary key,
  user_id           uuid        not null references users(id) on delete cascade,
  -- Snapshot dos primeiros ~80 caracteres da primeira mensagem do usuário.
  -- Não muda após o insert (a sessão mantém seu título original).
  title             text,
  -- Atualizado a cada turno persistido pelo chat route.
  last_activity_at  timestamptz not null default now(),
  -- Mantido em sync pelo chat route (+2 por turno).
  message_count     int         not null default 0,
  -- NULL = ativa; preenchido = arquivada explicitamente. A regra de 90 dias
  -- é aplicada como predicado em tempo de leitura (não preenche este campo).
  archived_at       timestamptz null,
  created_at        timestamptz not null default now()
);

-- ── 2. Índices (otimizados para os dois modos de listagem) ────────────────────

create index if not exists idx_advisor_sessions_user_active
  on advisor_sessions (user_id, last_activity_at desc)
  where archived_at is null;

create index if not exists idx_advisor_sessions_user_archived
  on advisor_sessions (user_id, archived_at desc)
  where archived_at is not null;

-- ── 3. Função de upsert chamada pelo chat route ───────────────────────────────
-- Insere na primeira mensagem (com title), nas demais só incrementa e atualiza
-- a última atividade. Se a sessão estava arquivada (archived_at not null), o
-- usuário voltando a falar nela desarquiva.

create or replace function advisor_session_upsert(
  p_session_id uuid,
  p_user_id    uuid,
  p_title      text,
  p_inc        int default 2
) returns void
language plpgsql
security definer
as $$
begin
  insert into advisor_sessions
    (session_id, user_id, title, last_activity_at, message_count, archived_at)
  values
    (p_session_id, p_user_id, p_title, now(), p_inc, null)
  on conflict (session_id) do update set
    last_activity_at = now(),
    message_count    = advisor_sessions.message_count + excluded.message_count,
    archived_at      = null;
    -- title NÃO é atualizado em conflito: a sessão mantém seu título original.
end;
$$;

-- ── 4. Backfill das sessões já existentes em advisory_memory ──────────────────

insert into advisor_sessions
  (session_id, user_id, title, last_activity_at, message_count, created_at)
select
  am.session_id,
  am.user_id,
  (
    select substring(am2.content from 1 for 80)
    from advisory_memory am2
    where am2.session_id = am.session_id
      and am2.role       = 'user'
    order by am2.created_at asc, am2.id asc
    limit 1
  ) as title,
  max(am.created_at) as last_activity_at,
  count(*)::int       as message_count,
  min(am.created_at) as created_at
from advisory_memory am
group by am.session_id, am.user_id
on conflict (session_id) do nothing;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

alter table advisor_sessions enable row level security;

create policy "Users can view own advisor sessions"
  on advisor_sessions for select to authenticated
  using (user_id = auth.uid());

create policy "Users can update own advisor sessions"
  on advisor_sessions for update to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own advisor sessions"
  on advisor_sessions for insert to authenticated
  with check (user_id = auth.uid());
