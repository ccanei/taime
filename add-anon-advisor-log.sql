-- TAIME anon_advisor_log (telemetria de usage por RESPOSTA do Advisor ANONIMO /ask)
-- Rodar no Supabase SQL Editor. APLICAR ANTES de os tokens comecarem a ser gravados.
--
-- Validado contra TAIME SQL UPDATED (v7) e contra add-anon-advisor-usage.sql:
--   - id uuid default uuid_generate_v4() (mesmo padrao de anon_advisor_usage/advisor_usage)
--   - timestamptz com default now()
--   - sem FK: o visitante anonimo nao tem user_id
--   - acesso SO server-side (service key bypassa RLS); RLS habilitado sem policy
--     nega anon/authenticated por padrao.
--
-- Por que uma tabela de LOG (1 linha por resposta) e nao colunas agregadas em
-- anon_advisor_usage:
--   anon_advisor_usage e uma janela HORARIA deslizante (question_count zera a cada
--   1h), entao nao serve de total historico. O log de 1 linha por resposta da
--   granularidade por dia (custo/dia, diagnostico) e permite contar visitantes
--   distintos e perguntas totais em qualquer janela. Esforco equivalente ao de
--   colunas agregadas, com muito mais leitura possivel.
--
-- PRIVACIDADE: guarda SO o ip_hash (nunca o IP cru) e os tokens. NUNCA o conteudo
-- da pergunta nem da resposta. O ip_hash e a mesma chave ja usada no rate limit.

CREATE TABLE IF NOT EXISTS public.anon_advisor_log (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  ip_hash       text NOT NULL,
  model         text,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT anon_advisor_log_pkey PRIMARY KEY (id)
);

-- Leituras do admin sao por janela de tempo (mes corrente, ultimos 30 dias) e por
-- ip_hash (sinais de abuso). Indices cobrem os dois eixos.
CREATE INDEX IF NOT EXISTS anon_advisor_log_created_at_idx
  ON public.anon_advisor_log (created_at DESC);
CREATE INDEX IF NOT EXISTS anon_advisor_log_ip_hash_idx
  ON public.anon_advisor_log (ip_hash);

ALTER TABLE public.anon_advisor_log ENABLE ROW LEVEL SECURITY;
-- Sem policy: nega anon/authenticated. Acesso e so via service key (server-side),
-- que bypassa RLS. O /api/ask grava com service key; o /admin/engagement le com
-- service key (pagina ja protegida por isAdmin).
