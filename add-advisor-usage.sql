-- TAIME advisor_usage (limite de mensagens do Executive Advisor)
-- Rodar no Supabase SQL Editor.
--
-- Validado contra TAIME SQL UPDATED (v7):
--   - public.users.id e a PK uuid; padrao de FK = REFERENCES public.users(id)
--   - id default uuid_generate_v4() (mesmo padrao de public.subscriptions)
--   - subscriptions.plan tem CHECK ('free','essential','strategic')
--   - advisor_usage NAO existia ainda
--
-- Regra de negocio:
--   Free      = 10 mensagens vitalicias (window_start fixa na 1a de sempre, nunca reseta)
--   Essential = 100 mensagens por janela de 30 dias (reset 30 dias apos a 1a mensagem)
--   Strategic = ilimitado (nunca chega a esta tabela)

CREATE TABLE IF NOT EXISTS public.advisor_usage (
  id             uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id        uuid NOT NULL,
  messages_used  integer NOT NULL DEFAULT 0,
  window_start   timestamp with time zone,
  plan_at_start  text,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT advisor_usage_pkey PRIMARY KEY (id),
  CONSTRAINT advisor_usage_user_id_key UNIQUE (user_id),
  CONSTRAINT advisor_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- RLS: cada usuario so ve/edita a propria linha.
ALTER TABLE public.advisor_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own advisor usage" ON public.advisor_usage;
CREATE POLICY "Users manage own advisor usage"
  ON public.advisor_usage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at automatico. Recria a funcao (idempotente) para a migration ser
-- auto-contida, e liga o trigger.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS advisor_usage_updated_at ON public.advisor_usage;
CREATE TRIGGER advisor_usage_updated_at
  BEFORE UPDATE ON public.advisor_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Consumo atomico e seguro contra concorrencia ────────────────────────────
-- SECURITY DEFINER + SELECT ... FOR UPDATE serializa por usuario (a linha e
-- travada durante a transacao, entao dois pedidos simultaneos nao gastam a mesma
-- vaga). p_rolling = true (Essential, janela de 30 dias) ou false (Free, vitalicio).
-- Retorna se permitiu, o total ja usado (incluindo esta mensagem quando permitida)
-- e o limite. Strategic nunca chama esta funcao (o app curto-circuita antes).
CREATE OR REPLACE FUNCTION public.advisor_consume_message(
  p_user_id uuid,
  p_plan    text,
  p_limit   integer,
  p_rolling boolean
) RETURNS TABLE(allowed boolean, used integer, msg_limit integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r public.advisor_usage%ROWTYPE;
BEGIN
  -- Garante a linha do usuario.
  INSERT INTO public.advisor_usage (user_id, plan_at_start)
    VALUES (p_user_id, p_plan)
    ON CONFLICT (user_id) DO NOTHING;

  -- Trava a linha ate o fim da transacao (serializa concorrencia).
  SELECT * INTO r FROM public.advisor_usage WHERE user_id = p_user_id FOR UPDATE;

  IF p_rolling THEN
    -- Essential: reseta a janela se nunca iniciou ou ja passou de 30 dias.
    IF r.window_start IS NULL OR r.window_start < (now() - interval '30 days') THEN
      UPDATE public.advisor_usage
        SET window_start = now(), messages_used = 0, plan_at_start = p_plan
        WHERE user_id = p_user_id
        RETURNING * INTO r;
    END IF;
  ELSE
    -- Free: marca a 1a mensagem de sempre e nunca reseta.
    IF r.window_start IS NULL THEN
      UPDATE public.advisor_usage
        SET window_start = now(), plan_at_start = COALESCE(r.plan_at_start, p_plan)
        WHERE user_id = p_user_id
        RETURNING * INTO r;
    END IF;
  END IF;

  -- Limite atingido: nao consome, devolve o estado atual.
  IF r.messages_used >= p_limit THEN
    RETURN QUERY SELECT false, r.messages_used, p_limit;
    RETURN;
  END IF;

  -- Consome uma mensagem.
  UPDATE public.advisor_usage
    SET messages_used = messages_used + 1
    WHERE user_id = p_user_id
    RETURNING * INTO r;

  RETURN QUERY SELECT true, r.messages_used, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advisor_consume_message(uuid, text, integer, boolean)
  TO authenticated, service_role, anon;
