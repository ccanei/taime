-- ============================================================
-- TAIME — Radar Signals Table
-- Rodar no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS radar_signals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title_pt        TEXT        NOT NULL,
  title_en        TEXT        NOT NULL,
  summary_pt      TEXT        NOT NULL,
  summary_en      TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  relevance       TEXT        NOT NULL CHECK (relevance IN ('high', 'medium', 'low')),
  source_category TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  published_at    TIMESTAMPTZ,
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_signals_collected_at ON radar_signals (collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_signals_relevance    ON radar_signals (relevance);
CREATE INDEX IF NOT EXISTS idx_radar_signals_category     ON radar_signals (category);

ALTER TABLE radar_signals ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read radar signals — public data
CREATE POLICY "Anyone can read radar signals"
  ON radar_signals FOR SELECT
  USING (true);
