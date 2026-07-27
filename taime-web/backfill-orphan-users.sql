-- Backfill de orfaos auth.users -> public.users (bug de sync do trigger
-- handle_new_user). Cria a linha em public.users para todo usuario autenticado
-- que ficou sem ela, e uma subscription 'free' ativa APENAS para esses orfaos
-- recem-criados (nunca mexe em quem ja tem linha ou subscription).
--
-- Idempotente: rodar quantas vezes quiser. Seguro: on_conflict do nothing.
-- Rodar no SQL editor do Supabase (precisa acesso ao schema auth).
--
-- Contexto (26/07/2026): o unico orfao conhecido era cc@gartner.com
-- (auth id 04a474ff-c1ec-4118-9f4a-be72134dafff, criado 2026-05-26). A correcao
-- de codigo em app/auth/callback/route.ts (upsert self-heal de public.users)
-- impede novos orfaos; este backfill limpa os que ja existiam.

with new_users as (
  insert into public.users (id, email, full_name, preferred_language)
  select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', ''),
    'pt-BR'
  from auth.users au
  left join public.users pu on pu.id = au.id
  where pu.id is null
    and au.email is not null
  on conflict (id) do nothing
  returning id
)
insert into public.subscriptions (user_id, plan, status)
select nu.id, 'free', 'active'
from new_users nu
left join public.subscriptions s on s.user_id = nu.id
where s.user_id is null
on conflict do nothing;

-- Confirmacao: deve retornar 0 orfaos apos rodar o backfill acima.
select count(*) as orphans_remaining
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null and au.email is not null;
