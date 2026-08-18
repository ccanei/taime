-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: Hero trend flag (curadoria manual da trend do hero da home)
--
-- Adiciona `is_hero` em report_trends: marca UMA trend para ocupar o card
-- "Última análise" do hero da home. A exclusividade (uma por vez) e garantida
-- na rota de escrita do admin (/api/admin/trend-hero), nao por constraint, para
-- permitir a troca atomica sem violar unicidade global durante o update.
--
-- Superficie publica: o endpoint /api/trends/top so considera is_hero de trends
-- de reports com status = 'published'. Sem nenhuma marcada, cai no comportamento
-- atual (maior taime_score do periodo publicado mais recente).
--
-- Indice parcial barato: cobre o lookup "a trend hero mais recente" (order by
-- created_at desc entre as marcadas), que normalmente tem 0 ou 1 linha.
--
-- Rodar manualmente no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE report_trends
  ADD COLUMN IF NOT EXISTS is_hero boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_report_trends_is_hero
  ON report_trends (created_at DESC)
  WHERE is_hero;

-- Exemplo de uso (o admin faz isto pela UI, nunca a mao em producao):
--   UPDATE report_trends SET is_hero = false WHERE is_hero;         -- limpa o anterior
--   UPDATE report_trends SET is_hero = true  WHERE id = '<UUID>';   -- destaca a nova
