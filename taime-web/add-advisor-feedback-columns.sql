-- TAIME feedback: colunas para o feedback in-chat do Executive Advisor
-- Rodar no Supabase SQL Editor. REUSA a tabela public.feedback existente (a mesma
-- do feedback do dashboard e do admin de feedback), sem tabela nova.
--
-- Validado contra o schema real de public.feedback:
--   id uuid, user_id uuid (FK users), user_email text, type text NOT NULL
--   DEFAULT 'suggestion' (SEM check, texto livre -> aceita 'advisor'),
--   message text NOT NULL, locale text, status text, created_at timestamptz.
-- (O v9 TAIME_SQL_UPDATED nao estava no repositorio no momento; validado contra o
--  dump de schema disponivel e contra a tabela viva via REST. feedback nao mudou.)
--
-- Tudo NULLABLE: nao afeta nenhuma linha existente (feedback do dashboard fica
-- intacto, com rating/question/answer/source = NULL).

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS rating   text NULL,
  ADD COLUMN IF NOT EXISTS question text NULL,
  ADD COLUMN IF NOT EXISTS answer   text NULL,
  ADD COLUMN IF NOT EXISTS source   text NULL;

-- CHECKs permitem NULL explicitamente (linhas antigas tem esses campos NULL).
ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_rating_check;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_rating_check CHECK (rating IS NULL OR rating IN ('up','down'));

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_source_check;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_source_check CHECK (source IS NULL OR source IN ('dashboard','advisor','ask'));

-- type continua texto livre (sem check restritivo): o feedback do Advisor usa
-- type='advisor'; o do dashboard segue 'suggestion'/'problem'/'praise'.
