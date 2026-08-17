-- ============================================================================
-- marketing_posts: rascunhos de posts de LinkedIn gerados a partir do uso real
-- do Executive Advisor sobre as trends do ultimo periodo publicado.
--
-- RLS: acesso SOMENTE admin, no mesmo padrao das demais tabelas admin do produto
-- (add-contact-requests.sql, add-report-read-usage.sql, add-free-report-unlocks.sql):
-- RLS habilitado SEM policy, entao anon/authenticated sao negados e o acesso e SO
-- via service key server-side (script do pipeline + rotas /api/admin/*).
--
-- Rodar uma vez no SQL editor do Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  period           date,                                   -- periodo do relatorio usado
  trend_id         uuid,                                   -- ref a trend usada
  trend_title      text,
  question         text,                                   -- pergunta feita ao Advisor
  advisor_response text,                                   -- resposta bruta (auditoria)
  post_pt          text,
  post_en          text,
  status           text        NOT NULL DEFAULT 'draft',
  published_at     timestamptz,
  CONSTRAINT marketing_posts_pkey PRIMARY KEY (id),
  CONSTRAINT marketing_posts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'published'::text])),
  CONSTRAINT marketing_posts_trend_id_fkey FOREIGN KEY (trend_id) REFERENCES public.report_trends(id)
);

CREATE INDEX IF NOT EXISTS marketing_posts_created_at_idx ON public.marketing_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_posts_status_idx     ON public.marketing_posts (status);

-- RLS on, sem policy: nega anon/authenticated, acesso so via service key.
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
