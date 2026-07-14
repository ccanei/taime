-- TAIME anon_advisor_usage (rate limit do Advisor ANONIMO /ask, por ip_hash)
-- Rodar no Supabase SQL Editor.
--
-- Validado contra TAIME SQL UPDATED (v7):
--   - id uuid default uuid_generate_v4() (mesmo padrao de subscriptions/advisor_usage)
--   - timestamptz com default now()
--   - sem FK: o visitante anonimo nao tem user_id
--   - acesso SO server-side (service key bypassa RLS); RLS habilitado sem policy
--     nega anon/authenticated por padrao.
--
-- Modelo de limites do /ask:
--   - Cookie assinado httpOnly: conta as 3 perguntas do visitante (limite vitalicio
--     por cookie; a UI mostra "pergunta X de 3").
--   - IP (ip_hash, nunca o IP cru): teto HORARIO por IP nesta tabela, para cortar
--     abuso sem punir IP compartilhado legitimo. window_start marca o inicio da
--     janela de 1h; question_count zera quando a janela expira.

CREATE TABLE IF NOT EXISTS public.anon_advisor_usage (
  id             uuid NOT NULL DEFAULT uuid_generate_v4(),
  ip_hash        text NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  window_start   timestamp with time zone,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT anon_advisor_usage_pkey PRIMARY KEY (id),
  CONSTRAINT anon_advisor_usage_ip_hash_key UNIQUE (ip_hash)
);

-- UNIQUE em ip_hash ja cria indice e habilita o upsert atomico (ON CONFLICT) da
-- funcao abaixo (uma linha por IP, janela deslizante de 1h).
CREATE INDEX IF NOT EXISTS anon_advisor_usage_ip_hash_idx
  ON public.anon_advisor_usage (ip_hash);

ALTER TABLE public.anon_advisor_usage ENABLE ROW LEVEL SECURITY;
-- Sem policy: nega anon/authenticated. Acesso e so via service key (server-side),
-- que bypassa RLS.

-- updated_at automatico (recria a funcao para a migration ser auto-contida).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anon_advisor_usage_updated_at ON public.anon_advisor_usage;
CREATE TRIGGER anon_advisor_usage_updated_at
  BEFORE UPDATE ON public.anon_advisor_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Consumo atomico do teto horario por IP ──────────────────────────────────
-- SECURITY DEFINER + SELECT ... FOR UPDATE serializa por IP. Reseta a janela se
-- passou de 1h. Se ja bateu o teto, NAO consome e devolve allowed=false. Retorna
-- (allowed, used, cap). Chamada so pelo /api/ask com service key.
CREATE OR REPLACE FUNCTION public.anon_advisor_consume(
  p_ip_hash    text,
  p_hourly_cap integer
) RETURNS TABLE(allowed boolean, used integer, cap integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r public.anon_advisor_usage%ROWTYPE;
BEGIN
  INSERT INTO public.anon_advisor_usage (ip_hash)
    VALUES (p_ip_hash)
    ON CONFLICT (ip_hash) DO NOTHING;

  SELECT * INTO r FROM public.anon_advisor_usage WHERE ip_hash = p_ip_hash FOR UPDATE;

  IF r.window_start IS NULL OR r.window_start < (now() - interval '1 hour') THEN
    UPDATE public.anon_advisor_usage
      SET window_start = now(), question_count = 0
      WHERE ip_hash = p_ip_hash
      RETURNING * INTO r;
  END IF;

  IF r.question_count >= p_hourly_cap THEN
    RETURN QUERY SELECT false, r.question_count, p_hourly_cap;
    RETURN;
  END IF;

  UPDATE public.anon_advisor_usage
    SET question_count = question_count + 1
    WHERE ip_hash = p_ip_hash
    RETURNING * INTO r;

  RETURN QUERY SELECT true, r.question_count, p_hourly_cap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anon_advisor_consume(text, integer) TO service_role;
