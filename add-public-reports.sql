-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME — Public sample reports
--
-- Adiciona duas colunas em `reports` para suportar a rota pública /r/[id]:
--   - is_public              → relatório aparece na rota pública (default: false)
--   - public_unlocked_rank   → qual trend fica liberada na amostra pública;
--                              as demais ficam borradas com CTA. Se null,
--                              o handler usa rank 1.
--
-- Por padrão tudo permanece privado — só os reports marcados explicitamente
-- com is_public = true ficam acessíveis sem login pela rota /r/[id].
--
-- Rodar manualmente no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS public_unlocked_rank int;

-- Exemplo de uso (depois de criadas as colunas):
--   UPDATE reports
--      SET is_public = true,
--          public_unlocked_rank = 3
--    WHERE id = '<UUID-DO-RELATORIO>';
