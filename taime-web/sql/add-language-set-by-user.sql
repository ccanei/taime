-- ──────────────────────────────────────────────────────────────────────────
-- TAIME — Flag de escolha explícita do idioma do perfil
--
-- public.users.preferred_language hoje aceita 'pt-BR' ou 'en' (CHECK).
-- O fluxo de aprovação grava 'pt-BR' por padrão; isso é apenas o ponto de
-- partida. O idioma final é resolvido por hierarquia:
--
--     escolha explícita (seletor no dashboard)
--       > detecção no primeiro login (cookie taime-locale)
--       > default 'pt-BR'
--
-- A coluna abaixo distingue "pt-BR por default" de "pt-BR escolhido pela
-- pessoa". Sem ela, a detecção no login seria ambígua e poderia sobrescrever
-- uma escolha consciente do usuário.
--
-- Regras de uso (implementadas no backend):
--   - Detecção no login NUNCA modifica registro com language_set_by_user=true
--   - Detecção no login só promove 'pt-BR' → 'en'; nunca rebaixa 'en' → 'pt-BR'
--   - Seletor no dashboard sempre seta language_set_by_user=true
--
-- Execute no Supabase SQL Editor:
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS language_set_by_user boolean NOT NULL DEFAULT false;
