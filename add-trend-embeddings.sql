-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME - Embedding por trend (camada fina de busca semantica)
--
-- Passo 2 do pgvector. Cria report_trend_embeddings: um chunk por trend e por
-- idioma (lang 'pt' | 'en'), com vetor text-embedding-3-small (1536 dims).
-- Esta camada e mais granular que reports.embedding (um vetor por relatorio):
-- permite ao Advisor (Passo 3) buscar trends individuais de qualquer periodo,
-- superando o router atual que so enxerga os top-6 titulos.
--
-- Pre-requisitos: extensao `vector` habilitada (ja usada por reports.embedding).
-- Populado por generate-trend-embeddings.ts (manual, apos publish).
--
-- Rodar no Supabase SQL Editor manualmente. NAO e executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_trend_embeddings (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Trend de origem. Cascade: se a trend some, o chunk some junto.
  trend_id    uuid        NOT NULL REFERENCES report_trends(id) ON DELETE CASCADE,
  -- Relatorio de origem (desnormalizado para join barato e ancoragem).
  report_id   uuid        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  -- Periodo herdado do relatorio: usado como filtro de plano na busca.
  period      date        NOT NULL,
  -- Rank da trend no relatorio (1 = mais relevante). Ancora #trend-{rank}.
  rank        smallint    NOT NULL,
  -- Idioma do conteudo embeddado.
  lang        text        NOT NULL CHECK (lang IN ('pt', 'en')),
  -- Chave estavel do tema entre ciclos (continuidade temporal). Idioma-neutra.
  theme_slug  text,
  -- Uma das 14 categorias de trend (idioma-neutra).
  category    text,
  -- Texto efetivamente embeddado (titulo + rationale + framework + then/now/next
  -- + org_implications + recommended_move, no idioma de `lang`). Sem scores.
  content     text        NOT NULL,
  -- Vetor cosine, mesmo modelo/dimensao de reports.embedding.
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Idempotencia: no maximo um chunk por (trend, idioma). O script faz upsert
  -- logico (pula o que ja existe), e esta constraint protege contra duplicatas.
  UNIQUE (trend_id, lang)
);

-- ── Indices ──────────────────────────────────────────────────────────────────

-- Busca por similaridade (cosine). ivfflat e o default amplamente suportado.
-- Observacao: ivfflat constroi melhores listas com a tabela JA populada; se
-- criar antes do backfill, rode REINDEX (ou recrie) depois de popular.
-- lists=100 e um bom ponto de partida para ~1k-10k linhas.
CREATE INDEX IF NOT EXISTS idx_trend_emb_vec
  ON report_trend_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Alternativa hnsw (descomente se a instancia suportar; melhor recall, sem
-- necessidade de reindex pos-backfill). Use UMA das duas estrategias de indice.
-- CREATE INDEX IF NOT EXISTS idx_trend_emb_vec_hnsw
--   ON report_trend_embeddings
--   USING hnsw (embedding vector_cosine_ops);

-- Filtros btree usados pela busca e por joins.
CREATE INDEX IF NOT EXISTS idx_trend_emb_period     ON report_trend_embeddings(period);
CREATE INDEX IF NOT EXISTS idx_trend_emb_theme_slug ON report_trend_embeddings(theme_slug);
CREATE INDEX IF NOT EXISTS idx_trend_emb_report_id  ON report_trend_embeddings(report_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Coerente com o projeto: o backend acessa via service_role (bypassa RLS). Para
-- qualquer leitura direta por usuario autenticado, espelhamos a politica de
-- report_trends (assinante ativo + relatorio publicado).
ALTER TABLE report_trend_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active subscribers can read trend embeddings" ON report_trend_embeddings;
CREATE POLICY "Active subscribers can read trend embeddings"
  ON report_trend_embeddings FOR SELECT TO authenticated
  USING (
    is_active_subscriber()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_trend_embeddings.report_id
        AND r.status = 'published'
    )
  );
