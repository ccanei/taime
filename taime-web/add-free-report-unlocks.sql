-- TAIME free_report_unlocks (cota de reports do plano Free)
-- Rodar no Supabase SQL Editor. Aplicar antes/junto do deploy. NAO aplicar
-- automaticamente em producao.
--
-- Contexto: a janela TEMPORAL do Free foi eliminada (arquivo completo para todos).
-- O Free passa a ser limitado por COTA: 2 reports completos por janela movel de 30
-- dias. Mesmo padrao de advisor_usage/advisor_consume_message e report_read_usage:
-- consumo ATOMICO em funcao SECURITY DEFINER, so acessivel pela service key.
--
-- Substitui a contagem racy que era feita no app sobre report_views. O gate agora
-- e a funcao free_unlock_report (decide + consome atomicamente).

CREATE TABLE IF NOT EXISTS public.free_report_unlocks (
  user_id     uuid NOT NULL,
  report_id   uuid NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_report_unlocks_pkey PRIMARY KEY (user_id, report_id),
  CONSTRAINT free_report_unlocks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
-- report_id SEM FK: um report apagado apenas deixa um unlock orfao inofensivo,
-- nunca bloqueia a cota por integridade referencial.

-- Consulta da cota: desbloqueios de um usuario na janela movel.
CREATE INDEX IF NOT EXISTS free_report_unlocks_user_time_idx
  ON public.free_report_unlocks (user_id, unlocked_at DESC);

ALTER TABLE public.free_report_unlocks ENABLE ROW LEVEL SECURITY;
-- Sem policy: nega anon/authenticated. Acesso so via service key (server-side) e
-- pela funcao SECURITY DEFINER abaixo.

-- Backfill: preserva os desbloqueios atuais (report_views) para o Free nao perder
-- a janela ativa na virada. Idempotente e seguro se report_views nao existir.
DO $$
BEGIN
  IF to_regclass('public.report_views') IS NOT NULL THEN
    INSERT INTO public.free_report_unlocks (user_id, report_id, unlocked_at)
      SELECT user_id, report_id, unlocked_at FROM public.report_views
      ON CONFLICT (user_id, report_id) DO NOTHING;
  END IF;
END $$;

-- ── Desbloqueio atomico de report para o Free ───────────────────────────────
-- pg_advisory_xact_lock serializa por usuario dentro da transacao (a PK e
-- composta, nao ha uma linha unica por usuario para SELECT FOR UPDATE; o advisory
-- lock e o equivalente limpo). Regras:
--   - report ja desbloqueado DENTRO da janela  -> allowed, NAO consome (idempotente);
--   - sob a cota (< p_limit distintos na janela) -> insere/renova e allowed;
--   - cota esgotada                              -> denied + quando libera 1 slot.
-- Retorna (allowed, already_unlocked, unlock_count, quota_resets_at).
CREATE OR REPLACE FUNCTION public.free_unlock_report(
  p_user_id   uuid,
  p_report_id uuid,
  p_limit     integer  DEFAULT 2,
  p_window    interval DEFAULT interval '30 days'
) RETURNS TABLE(
  allowed          boolean,
  already_unlocked boolean,
  unlock_count     integer,
  quota_resets_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_active  boolean;
  v_count   integer;
  v_oldest  timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('free_unlock:' || p_user_id::text));

  -- Ja desbloqueado e ativo (dentro da janela)? idempotente, nao consome.
  SELECT true INTO v_active
    FROM public.free_report_unlocks
    WHERE user_id = p_user_id
      AND report_id = p_report_id
      AND unlocked_at >= now() - p_window;

  SELECT count(DISTINCT report_id)::int INTO v_count
    FROM public.free_report_unlocks
    WHERE user_id = p_user_id
      AND unlocked_at >= now() - p_window;

  IF v_active THEN
    RETURN QUERY SELECT true, true, v_count, NULL::timestamptz;
    RETURN;
  END IF;

  -- Sob a cota: consome (insere ou renova o unlocked_at de um unlock expirado).
  IF v_count < p_limit THEN
    INSERT INTO public.free_report_unlocks (user_id, report_id, unlocked_at)
      VALUES (p_user_id, p_report_id, now())
      ON CONFLICT (user_id, report_id) DO UPDATE SET unlocked_at = now();
    RETURN QUERY SELECT true, false, v_count + 1, NULL::timestamptz;
    RETURN;
  END IF;

  -- Cota esgotada: quando o desbloqueio mais antigo da janela sair, libera 1 slot.
  SELECT min(unlocked_at) INTO v_oldest
    FROM public.free_report_unlocks
    WHERE user_id = p_user_id
      AND unlocked_at >= now() - p_window;

  RETURN QUERY SELECT false, false, v_count, (v_oldest + p_window);
END;
$$;

GRANT EXECUTE ON FUNCTION public.free_unlock_report(uuid, uuid, integer, interval)
  TO service_role;
