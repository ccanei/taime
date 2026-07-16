-- TAIME anon_advisor_usage: teto ACUMULADO de 30 dias por IP (alem do 8/h)
-- Rodar no Supabase SQL Editor. Aplicar ANTES/junto do deploy do /api/ask novo.
--
-- Contexto: a tabela public.anon_advisor_usage JA EXISTE em producao (criada por
-- add-anon-advisor-usage.sql; nao esta no dump v7 porque foi criada depois). Esta
-- migration so ADICIONA duas colunas e SUBSTITUI a funcao de consumo para impor um
-- segundo limite. Idempotente (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE).
--
-- Por que: o cookie de contagem (3 perguntas) e persistente (1 ano), mas some ao
-- limpar cookies ou usar aba anonima. O unico teto server-side era a janela
-- deslizante de 1h (8/h), anti-rajada, que reseta sozinha a cada hora. Sem um teto
-- acumulado, o mesmo IP volta a ter perguntas indefinidamente. Este teto de 30 dias
-- fecha o buraco.
--
-- 12/30d de proposito ALTO: operadoras moveis BR usam CGNAT (muitos usuarios reais
-- atras do mesmo IP), entao o teto nao pode ser agressivo ou bloqueia gente legitima.

-- ── Colunas da janela de 30 dias ────────────────────────────────────────────
ALTER TABLE public.anon_advisor_usage
  ADD COLUMN IF NOT EXISTS month_window_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS month_count        integer NOT NULL DEFAULT 0;

-- ── Consumo atomico com DOIS tetos (8/h anti-rajada + 12/30d acumulado) ──────
-- A assinatura muda (ganha p_monthly_cap), entao removemos a versao antiga de 2
-- args antes de recriar, para nao deixar overload ambiguo no PostgREST.
DROP FUNCTION IF EXISTS public.anon_advisor_consume(text, integer);

CREATE OR REPLACE FUNCTION public.anon_advisor_consume(
  p_ip_hash     text,
  p_hourly_cap  integer,
  p_monthly_cap integer
) RETURNS TABLE(allowed boolean, used integer, cap integer, month_used integer, month_cap integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r public.anon_advisor_usage%ROWTYPE;
BEGIN
  INSERT INTO public.anon_advisor_usage (ip_hash)
    VALUES (p_ip_hash)
    ON CONFLICT (ip_hash) DO NOTHING;

  -- Trava a linha ate o fim da transacao (serializa concorrencia por IP).
  SELECT * INTO r FROM public.anon_advisor_usage WHERE ip_hash = p_ip_hash FOR UPDATE;

  -- Reset da janela HORARIA (anti-rajada) se expirou.
  IF r.window_start IS NULL OR r.window_start < (now() - interval '1 hour') THEN
    UPDATE public.anon_advisor_usage
      SET window_start = now(), question_count = 0
      WHERE ip_hash = p_ip_hash
      RETURNING * INTO r;
  END IF;

  -- Reset da janela de 30 DIAS (teto acumulado) se expirou.
  IF r.month_window_start IS NULL OR r.month_window_start < (now() - interval '30 days') THEN
    UPDATE public.anon_advisor_usage
      SET month_window_start = now(), month_count = 0
      WHERE ip_hash = p_ip_hash
      RETURNING * INTO r;
  END IF;

  -- Teto horario: nao consome, devolve estado atual.
  IF r.question_count >= p_hourly_cap THEN
    RETURN QUERY SELECT false, r.question_count, p_hourly_cap, COALESCE(r.month_count, 0), p_monthly_cap;
    RETURN;
  END IF;

  -- Teto acumulado de 30 dias: nao consome, devolve estado atual.
  IF COALESCE(r.month_count, 0) >= p_monthly_cap THEN
    RETURN QUERY SELECT false, r.question_count, p_hourly_cap, r.month_count, p_monthly_cap;
    RETURN;
  END IF;

  -- Passou nos dois tetos: consome, incrementando AMBOS os contadores.
  UPDATE public.anon_advisor_usage
    SET question_count = question_count + 1,
        month_count    = COALESCE(month_count, 0) + 1
    WHERE ip_hash = p_ip_hash
    RETURNING * INTO r;

  RETURN QUERY SELECT true, r.question_count, p_hourly_cap, r.month_count, p_monthly_cap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anon_advisor_consume(text, integer, integer) TO service_role;
