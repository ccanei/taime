-- TAIME report_read_usage (rate limit de leitura de report completo por conta)
-- Rodar no Supabase SQL Editor. Aplicar antes/junto do deploy.
--
-- Contexto de schema: advisor_usage e anon_advisor_usage JA existem em producao
-- (nao estao no dump v7, foram criadas depois). Esta tabela e NOVA e segue o mesmo
-- padrao de advisor_usage: id uuid_generate_v4, FK para public.users(id), janela
-- deslizante, consumo atomico via SELECT ... FOR UPDATE em funcao SECURITY DEFINER.
--
-- Objetivo: barrar exportacao em massa (scraping logado) sem atrapalhar leitura
-- humana. Teto GENEROSO de 30 aberturas de report COMPLETO por hora, por user_id.
-- So conta abertura de conteudo integral (a pagina /reports/[id] quando o plano da
-- acesso completo). Preview, sample publico e teaser NAO passam por aqui.

CREATE TABLE IF NOT EXISTS public.report_read_usage (
  id           uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL,
  read_count   integer NOT NULL DEFAULT 0,
  window_start timestamp with time zone,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT report_read_usage_pkey PRIMARY KEY (id),
  CONSTRAINT report_read_usage_user_id_key UNIQUE (user_id),
  CONSTRAINT report_read_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- UNIQUE em user_id habilita o upsert atomico (ON CONFLICT) e o SELECT FOR UPDATE.
CREATE INDEX IF NOT EXISTS report_read_usage_user_id_idx
  ON public.report_read_usage (user_id);

ALTER TABLE public.report_read_usage ENABLE ROW LEVEL SECURITY;
-- Sem policy: nega anon/authenticated. Acesso so via service key (server-side) e
-- pela funcao SECURITY DEFINER abaixo.

-- updated_at automatico (recria a funcao para a migration ser auto-contida).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_read_usage_updated_at ON public.report_read_usage;
CREATE TRIGGER report_read_usage_updated_at
  BEFORE UPDATE ON public.report_read_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Consumo atomico do teto horario por usuario ─────────────────────────────
-- SECURITY DEFINER + SELECT ... FOR UPDATE serializa por usuario. Reseta a janela
-- se passou de 1h. Se ja bateu o teto, NAO consome e devolve allowed=false.
-- Retorna (allowed, used, cap). Chamada so pelo servidor com service key.
CREATE OR REPLACE FUNCTION public.report_read_consume(
  p_user_id    uuid,
  p_hourly_cap integer
) RETURNS TABLE(allowed boolean, used integer, cap integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r public.report_read_usage%ROWTYPE;
BEGIN
  INSERT INTO public.report_read_usage (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO r FROM public.report_read_usage WHERE user_id = p_user_id FOR UPDATE;

  -- Reseta a janela deslizante de 1h.
  IF r.window_start IS NULL OR r.window_start < (now() - interval '1 hour') THEN
    UPDATE public.report_read_usage
      SET window_start = now(), read_count = 0
      WHERE user_id = p_user_id
      RETURNING * INTO r;
  END IF;

  -- Teto atingido: nao consome, devolve o estado atual.
  IF r.read_count >= p_hourly_cap THEN
    RETURN QUERY SELECT false, r.read_count, p_hourly_cap;
    RETURN;
  END IF;

  -- Consome uma abertura.
  UPDATE public.report_read_usage
    SET read_count = read_count + 1
    WHERE user_id = p_user_id
    RETURNING * INTO r;

  RETURN QUERY SELECT true, r.read_count, p_hourly_cap;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_read_consume(uuid, integer) TO service_role;
