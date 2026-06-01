-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME — Curadoria editorial de relatórios
-- Adiciona estados de revisão ao enum de status + colunas de validação automática
-- Execute no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Amplia o CHECK de status: adiciona 'pending_review' e 'rejected'
--    Estados finais: draft | generating | pending_review | published | rejected | archived
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'generating'::text,
    'pending_review'::text,
    'published'::text,
    'rejected'::text,
    'archived'::text
  ]));

-- 2) Colunas de validação automática (preenchidas pelo validate-report.ts)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS validation_verdict text
    CHECK (validation_verdict IS NULL OR validation_verdict = ANY (ARRAY[
      'pass'::text, 'needs_review'::text, 'fail'::text
    ])),
  ADD COLUMN IF NOT EXISTS validation_flags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS signal_count integer;

-- 3) Índice para a fila do admin (filtra por status, ordena por período)
CREATE INDEX IF NOT EXISTS reports_status_period_idx
  ON public.reports (status, period DESC, report_number ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notas
-- ─────────────────────────────────────────────────────────────────────────────
-- • Relatórios já publicados ANTES desta migração permanecem 'published' com
--   validation_verdict = NULL. Aparecem na aba "Publicados" sem badge de validação
--   (foram aprovados manualmente no fluxo antigo). Nada quebra.
-- • validation_flags é um array JSONB. Formato de cada flag:
--     {
--       "id": "score_mismatch" | "source_name" | "em_dash" | "monetary" |
--             "unsupported_claim" | "temporal_breach" | "partially_supported",
--       "severity": "blocking" | "warning" | "info",
--       "category": "deterministic" | "grounding" | "temporal",
--       "trend_rank": 2,                       -- null quando é a nível de relatório
--       "field": "taime_framework_pt_br.move", -- onde foi encontrado
--       "claim": "trecho do relatório",        -- o que o validador analisou
--       "detail": "explicação legível",        -- o que ele achou (ou não achou)
--       "lang": "pt-BR" | "en" | null
--     }
