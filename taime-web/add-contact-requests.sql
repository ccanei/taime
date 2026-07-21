-- TAIME contact_requests (pedidos de contato do Advisor logado)
-- Rodar no Supabase SQL Editor. APLICAR ANTES de testar a Parte A.
--
-- Validado contra TAIME SQL UPDATED:
--   - id uuid DEFAULT uuid_generate_v4() (mesmo padrao de advisory_memory)
--   - user_id uuid NOT NULL, FK REFERENCES public.users(id) (como advisory_memory)
--   - conversation_id = o session_id do Advisor (advisory_memory.session_id, uuid).
--     Sem FK: session_id nao e PK de nenhuma tabela (advisory_memory tem varias
--     linhas por sessao). Nullable por seguranca (pedido sem sessao viva).
--   - timestamptz DEFAULT now()
--   - acesso SO server-side (service key bypassa RLS); RLS habilitado sem policy
--     nega anon/authenticated por padrao.

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id              uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL,
  conversation_id uuid,
  subject         text NOT NULL,
  message         text NOT NULL,
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied')),
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contact_requests_pkey PRIMARY KEY (id),
  CONSTRAINT contact_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS contact_requests_user_id_idx ON public.contact_requests (user_id);
CREATE INDEX IF NOT EXISTS contact_requests_status_idx  ON public.contact_requests (status);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
-- Sem policy: nega anon/authenticated. Acesso so via service key (server-side):
-- o /api/advisor/contact grava e o /admin/engagement le, ambos com service key e
-- protegidos por sessao/isAdmin.
