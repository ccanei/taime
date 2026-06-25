-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME - Memoria de cliente do Advisor (resumos de sessao + embedding)
--
-- Cada sessao FECHADA do Advisor vira UM resumo estruturado (gerado por Haiku) +
-- embedding (text-embedding-3-small, 1536 dims). Habilita o contexto hibrido:
--   - o resumo da ultima sessao entra sempre (memoria recente);
--   - resumos antigos relevantes entram por busca semantica (match_session_summaries).
--
-- Memoria e ESTRITAMENTE por usuario: a RLS e os filtros por user_id garantem
-- que um usuario jamais ve resumo de outro.
--
-- FKs validadas: advisor_sessions(session_id) e public.users(id). Embedding 1536.
-- Pre-requisitos: extensao `vector` + `uuid-ossp` (ja usadas no projeto).
-- Populado por generate-session-summaries.ts (manual, desacoplado da sessao).
--
-- Rodar no Supabase SQL Editor manualmente. NAO e executado pelo pipeline.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advisor_session_summaries (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Sessao resumida. Cascade: se a sessao some, o resumo some junto.
  session_id  uuid        NOT NULL REFERENCES advisor_sessions(session_id) ON DELETE CASCADE,
  -- Dono do resumo. Memoria e sempre por usuario.
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Resumo estruturado em campos fixos (temas, decisoes, pendencias, contexto da
  -- empresa). Texto profissional e factual, sem divagacao pessoal.
  summary     text        NOT NULL,
  -- Vetor cosine do resumo, mesmo modelo/dimensao dos demais embeddings.
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Idempotencia: no maximo um resumo por sessao. O script faz upsert por sessao.
  UNIQUE (session_id)
);

-- ── Indices ──────────────────────────────────────────────────────────────────

-- Busca por similaridade (cosine). ivfflat com lists=100 (bom para ate ~10k).
-- ivfflat constroi melhores listas com a tabela JA populada; recrie/REINDEX
-- apos um backfill grande se necessario.
CREATE INDEX IF NOT EXISTS idx_session_summaries_vec
  ON advisor_session_summaries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Filtro por dono (toda leitura de memoria e por user_id).
CREATE INDEX IF NOT EXISTS idx_session_summaries_user_id
  ON advisor_session_summaries(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- O backend acessa via service_role (bypassa RLS). Para leitura direta por
-- usuario autenticado, cada um so ve os PROPRIOS resumos. Jamais cruza usuarios.
ALTER TABLE advisor_session_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own session summaries" ON advisor_session_summaries;
CREATE POLICY "Users can read own session summaries"
  ON advisor_session_summaries FOR SELECT TO authenticated
  USING (user_id = auth.uid());
