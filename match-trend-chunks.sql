-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME - Busca semantica fina por trend (RPC)
--
-- Recebe um vetor de query (text-embedding-3-small, 1536 dims) e retorna os
-- chunks de trend mais similares por cosine, filtrando por periodo (gate de
-- plano). Usado pelo Advisor no Passo 3; aqui entra apenas como infra testavel.
--
-- period_floor = piso de periodo permitido ao plano do usuario:
--   Strategic -> data muito antiga (ou '0001-01-01') para liberar todo o acervo.
--   Essential -> CURRENT_DATE - interval '36 months' (janela de 3 anos).
--
-- Operador `<=>` e cosine distance (0 = identico). `1 - distance` = similarity.
--
-- Pre-requisitos: report_trend_embeddings populada por generate-trend-embeddings.ts.
-- Rodar no Supabase SQL Editor manualmente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_trend_chunks(
  query_embedding vector(1536),
  period_floor    date,
  match_count     int DEFAULT 10
)
RETURNS TABLE (
  trend_id   uuid,
  report_id  uuid,
  period     date,
  rank       smallint,
  lang       text,
  theme_slug text,
  category   text,
  content    text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.trend_id,
    e.report_id,
    e.period,
    e.rank,
    e.lang,
    e.theme_slug,
    e.category,
    e.content,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM report_trend_embeddings e
  WHERE e.embedding IS NOT NULL
    AND e.period >= period_floor
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
