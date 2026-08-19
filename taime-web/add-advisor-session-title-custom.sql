-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: titulo de conversa definido pelo usuario (rename)
--
-- Marca as conversas cujo titulo foi RENOMEADO manualmente pelo usuario, para o
-- auto-titulo do Haiku (no chat route, via after()) NAO sobrescrever. O upsert de
-- sessao (advisor_session_upsert) ja preserva o titulo em conflito; este flag cobre
-- a unica outra escrita de titulo (o auto-titulo da 1a resposta).
--
-- Idempotente. Rodar manualmente no Supabase SQL Editor. NAO executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.advisor_sessions
  add column if not exists title_custom boolean not null default false;
