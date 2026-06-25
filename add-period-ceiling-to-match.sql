-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME - Advisor v4.6: teto de periodo (period_ceiling) na busca por trend
--
-- Recria match_trend_chunks adicionando `period_ceiling date` alem do
-- `period_floor` ja existente. Agora a busca pode ser limitada a um INTERVALO de
-- periodo [floor, ceiling], usado quando o usuario cita um periodo explicito
-- ("relatorios de junho de 2026", "em 2024", "ultimo relatorio").
--
-- Compatibilidade: period_ceiling tem DEFAULT permissivo ('9999-12-01'), entao
-- chamadas antigas que passam apenas period_floor continuam funcionando sem
-- alteracao (comportamento identico ao Passo 3/4: floor do plano, sem teto).
--
-- O filtro de plano (Passo 4) e respeitado no app: o floor efetivo passado aqui
-- ja e o MAIS restritivo entre o periodo pedido e o piso do plano. Esta funcao
-- so aplica a janela [floor, ceiling] que recebe.
--
-- Operador `<=>` e cosine distance (0 = identico). `1 - distance` = similarity.
-- Rodar no Supabase SQL Editor manualmente (NAO e executado pelo pipeline).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_trend_chunks(
  query_embedding vector(1536),
  period_floor    date,
  match_count     int  DEFAULT 10,
  period_ceiling  date DEFAULT '9999-12-01'
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
    AND e.period <= period_ceiling
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
