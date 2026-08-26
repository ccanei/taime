-- ============================================================================
-- marketing_posts: campos da versao PUBLICADA e origem do registro.
--
-- Contexto: a pagina /admin/posts guarda os drafts gerados pelo script, mas a
-- versao que sai no LinkedIn e editada manualmente antes de publicar. Estas
-- colunas registram o texto EXATO publicado (PT/EN) e distinguem posts gerados
-- pela maquina dos criados manualmente no admin.
--
--   published_pt / published_en : texto exato publicado, editado a mao no admin.
--   source                      : 'machine' (gerado pelo script) | 'manual'
--                                 (criado direto no admin). Default 'machine'
--                                 preserva todos os registros existentes.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS) e sem impacto no existente: linhas
-- atuais herdam source='machine' e published_* nulos.
--
-- Rodar uma vez no SQL editor do Supabase.
-- ============================================================================

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS published_pt text,
  ADD COLUMN IF NOT EXISTS published_en text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'machine'
    CHECK (source IN ('machine', 'manual'));
