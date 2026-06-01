-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME — Defaults de plano (subscriptions) + plano solicitado na waitlist
-- Execute no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Convenção:
--   * subscriptions.plan aceita os valores em INGLÊS: 'free' | 'essential' | 'strategic'.
--   * waitlist.requested_plan armazena a preferência indicada pelo usuário no
--     formulário de cadastro (mesmos 3 valores). O admin decide o plano final ao
--     aprovar — não é vinculativo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Adiciona coluna requested_plan à waitlist
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS requested_plan text DEFAULT 'free';

-- Garante que subscriptions.plan tenha default
ALTER TABLE subscriptions ALTER COLUMN plan SET DEFAULT 'free';
