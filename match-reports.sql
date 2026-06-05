-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME — Semantic search RPC
--
-- Recebe um vetor de query (text-embedding-3-small, 1536 dims) e retorna os
-- relatórios publicados mais similares por cosine similarity.
--
-- Pré-requisitos: extensão `vector` habilitada, coluna `reports.embedding`
-- já populada por generate-embeddings.ts.
--
-- Operador: `<=>` é cosine distance (0 = idênticos, 2 = opostos).
-- `1 - distance` devolve similarity normalizada (1 = idêntico, -1 = oposto).
--
-- Rodar no Supabase SQL Editor manualmente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_reports(
  query_embedding vector(1536),
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id          uuid,
  title_pt_br text,
  title_en    text,
  period      date,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id,
    r.title_pt_br,
    r.title_en,
    r.period,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM reports r
  WHERE r.status = 'published' AND r.embedding IS NOT NULL
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
