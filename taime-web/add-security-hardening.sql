-- ─────────────────────────────────────────────────────────────────────────────
-- TAIME: hardening dos achados do linter de seguranca do Supabase
--
-- Corrige, SEM quebrar nenhum fluxo (o app usa service key server-side para todas
-- as RPCs; nao ha chamada client-side de nenhuma destas funcoes):
--   1. Funcoes SECURITY DEFINER (e triggers) executaveis por anon/authenticated via
--      REST -> fecha o acesso ao publico, mantendo o service_role.
--   2. View public.user_engagement_monthly com SECURITY DEFINER (ignora RLS) -> passa
--      a rodar como o usuario consultante e perde o SELECT dos roles publicos.
--   3. search_path mutavel nas funcoes do linter -> fixa (anti schema-hijacking).
--
-- MECANICA IMPORTANTE (por que revogar de PUBLIC, nao so de anon/authenticated):
-- no Postgres toda funcao nasce com EXECUTE para PUBLIC, e anon/authenticated herdam
-- desse PUBLIC. Um "REVOKE ... FROM anon, authenticated" isolado seria NO-OP (eles
-- continuam executando via PUBLIC). Entao revogamos de PUBLIC (e tambem de anon,
-- authenticated, caso haja grant direto) e RE-CONCEDEMOS ao service_role. Resultado:
-- anon/authenticated nao executam mais; o app (service key = service_role) segue igual.
--
-- EXCECAO CIRURGICA: is_active_subscriber() e chamada DENTRO de policies RLS
-- (reports, report_trends, report_trend_embeddings), que rodam como o usuario
-- consultante. authenticated PRECISA manter EXECUTE, senao qualquer SELECT client-side
-- de assinante nesses conteudos quebraria. Por isso ela recebe SO o fix de search_path,
-- nunca o revoke.
--
-- Idempotente (REVOKE/GRANT/ALTER sao repetiveis; o DO varre pg_proc por nome, entao
-- cobre overloads como anon_advisor_consume 2-arg + 3-arg e as duas triggers de auth
-- que nao vivem nas migrations do repo). Rodar manualmente no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 + 3. Funcoes: fecha o publico e fixa o search_path ─────────────────────
do $$
declare
  r record;
  -- SERVER-ONLY (service key) ou TRIGGER: revoke do publico + grant service_role + search_path.
  revoke_fns text[] := array[
    'advisor_consume_message',          -- server (lib/advisorUsage, service)
    'advisor_session_upsert',           -- server (advisor/chat, service)
    'anon_advisor_consume',             -- server (ask + admin/waitlist, service)
    'free_unlock_report',               -- server (reports/[id], service)
    'report_read_consume',              -- server (reports/[id], service)
    'grant_free_subscription_on_signup',-- trigger (auth.users)
    'handle_new_user',                  -- trigger (auth.users)
    'set_updated_at',                   -- trigger (updated_at)
    'update_updated_at_column',         -- trigger (updated_at)
    'match_reports',                    -- server (api/search, service; sql stable)
    'match_trend_chunks',               -- server (advisor/chat + ask, service; sql stable)
    'match_trend_chunks_since',         -- server (alerts core, service; sql stable)
    'match_session_summaries'           -- server (advisor/chat, service; sql stable)
  ];
  -- EXCECAO: usada em policy RLS -> mantem EXECUTE, so fixa search_path.
  fixonly_fns text[] := array['is_active_subscriber'];
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(revoke_fns)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    raise notice 'fechada (revoke public + grant service_role + search_path): %', r.sig;
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(fixonly_fns)
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    raise notice 'so search_path (excecao de policy RLS, mantem EXECUTE): %', r.sig;
  end loop;
end $$;

-- ── 2. View de engagement: respeita RLS + so service key le ───────────────────
-- security_invoker=true: a view passa a rodar com as permissoes (e RLS) do usuario
-- consultante, nao mais do criador. O /admin/engagement le via service key
-- (service_role, que ja tem acesso as tabelas e bypassa RLS), entao continua igual;
-- anon/authenticated perdem o SELECT (nao ha leitura client-side desta view).
alter view public.user_engagement_monthly set (security_invoker = true);
revoke select on public.user_engagement_monthly from public, anon, authenticated;
grant  select on public.user_engagement_monthly to service_role;

-- ── Nota (fora do SQL): item "Leaked Password Protection" ────────────────────
-- E um toggle do painel, nao migra por SQL:
--   Dashboard -> Authentication -> Settings -> habilitar a checagem HaveIBeenPwned.
