-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME - Busca semantica de memoria de cliente (RPC)
--
-- Recebe um vetor de query (text-embedding-3-small, 1536 dims) e retorna os
-- resumos de sessao mais similares DO MESMO usuario por cosine. Usado pelo
-- Advisor (Fase 3 da memoria de cliente) para trazer 1-2 conversas antigas
-- relevantes alem da ultima sessao (que ja entra sempre).
--
-- Memoria e ESTRITAMENTE por usuario: o filtro WHERE s.user_id = p_user_id
-- garante que um usuario JAMAIS recebe resumo de outro. p_exclude_session tira
-- a sessao atual (e, na pratica, a "ultima sessao" ja injetada) do resultado.
--
-- Operador `<=>` e cosine distance (0 = identico). `1 - distance` = similarity.
--
-- Pre-requisitos: advisor_session_summaries populada por
-- generate-session-summaries.ts. Rodar no Supabase SQL Editor manualmente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_session_summaries(
  query_embedding   vector(1536),
  p_user_id         uuid,
  p_exclude_session uuid DEFAULT NULL,
  match_count       int  DEFAULT 3
)
RETURNS TABLE (
  session_id uuid,
  summary    text,
  title      text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.session_id,
    s.summary,
    sess.title,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM advisor_session_summaries s
  LEFT JOIN advisor_sessions sess ON sess.session_id = s.session_id
  WHERE s.embedding IS NOT NULL
    AND s.user_id = p_user_id
    AND (p_exclude_session IS NULL OR s.session_id <> p_exclude_session)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;
