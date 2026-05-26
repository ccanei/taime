-- ============================================================
-- TAIME Platform — Schema SQL
-- Supabase (PostgreSQL 15+)
-- Gerar no: Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- HELPER: auto-update updated_at em qualquer tabela
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- 1. SOURCES — Fontes tier-1 cadastradas
-- Estática: ~25 fontes configuradas uma vez, gerenciadas pelo admin.
-- ============================================================

create table sources (
  id          uuid        primary key default uuid_generate_v4(),
  name        text        not null,
  url         text        not null,
  tier        smallint    not null default 1 check (tier between 1 and 3),
  -- 'research' | 'consulting' | 'vc' | 'media' | 'academic' | 'think_tank'
  category    text        not null,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_sources_updated_at
  before update on sources
  for each row execute function set_updated_at();


-- ============================================================
-- 2. SIGNALS — Artigos coletados por período (via Serper API)
-- Um registro por artigo coletado. Período = primeiro dia do mês.
-- ============================================================

create table signals (
  id           uuid        primary key default uuid_generate_v4(),
  source_id    uuid        not null references sources(id),
  -- Sempre o primeiro dia do mês: '2026-05-01', '2026-06-01', etc.
  period       date        not null,
  title        text        not null,
  url          text,
  content      text,
  -- Resumo gerado pelo LLM antes do clustering
  summary      text,
  -- Campos extras do Serper: author, published_date, snippet, etc.
  metadata     jsonb       not null default '{}',
  collected_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_signals_period    on signals(period);
create index idx_signals_source_id on signals(source_id);


-- ============================================================
-- 3. SIGNAL_CLUSTERS — Grupos temáticos identificados pelo LLM
-- O LLM agrupa os signals por tema antes de gerar os trends.
-- signal_ids: array de UUIDs referenciando signals desta janela.
-- ============================================================

create table signal_clusters (
  id            uuid        primary key default uuid_generate_v4(),
  period        date        not null,
  name          text        not null,
  description   text,
  signal_ids    uuid[]      not null default '{}',
  -- Chain-of-thought do LLM ao identificar o cluster
  llm_reasoning text,
  created_at    timestamptz not null default now()
);

create index idx_signal_clusters_period on signal_clusters(period);


-- ============================================================
-- 4. REPORTS — Um relatório por período (metadados)
-- O conteúdo analítico fica em report_trends.
-- ============================================================

create table reports (
  id                      uuid        primary key default uuid_generate_v4(),
  -- Garante exatamente um relatório por mês
  period                  date        not null unique,
  -- 'draft' → 'generating' → 'published' → 'archived'
  status                  text        not null default 'draft'
                            check (status in ('draft', 'generating', 'published', 'archived')),
  title_pt_br             text,
  title_en                text,
  executive_summary_pt_br text,
  executive_summary_en    text,
  published_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_reports_period on reports(period);
create index idx_reports_status on reports(status);

create trigger trg_reports_updated_at
  before update on reports
  for each row execute function set_updated_at();


-- ============================================================
-- 5. REPORT_TRENDS — 3-5 trends por relatório com análise completa
--
-- Estrutura dos campos JSONB:
--
-- taime_framework_{lang}:
--   { "type": "...", "act": "...", "impact": "...", "move": "...", "exit": "..." }
--
-- then_now_next_{lang}:
--   { "then": "...", "now": "...", "next": "..." }
--
-- org_implications_{lang}:
--   { "technology": "...", "hr": "...", "finance": "...",
--     "marketing": "...", "operations": "..." }
-- ============================================================

create table report_trends (
  id                          uuid      primary key default uuid_generate_v4(),
  report_id                   uuid      not null references reports(id) on delete cascade,
  signal_cluster_id           uuid      references signal_clusters(id),
  -- Posição do trend no relatório (1 = mais relevante)
  rank                        smallint  not null check (rank between 1 and 5),

  -- Título do trend nos dois idiomas nativos
  title_pt_br                 text      not null,
  title_en                    text      not null,

  -- TAIME Score: 0–100 com justificativa semântica gerada pelo LLM
  taime_score                 smallint  not null check (taime_score between 0 and 100),
  taime_score_rationale_pt_br text      not null,
  taime_score_rationale_en    text      not null,

  -- Framework TYPE → ACT → IMPACT → MOVE → EXIT
  taime_framework_pt_br       jsonb     not null default '{}',
  taime_framework_en          jsonb     not null default '{}',

  -- Narrativa temporal: THEN / NOW / NEXT
  then_now_next_pt_br         jsonb     not null default '{}',
  then_now_next_en            jsonb     not null default '{}',

  -- Implicações organizacionais por área (JSONB = flexível por indústria)
  org_implications_pt_br      jsonb     not null default '{}',
  org_implications_en         jsonb     not null default '{}',

  -- Gatilhos de decisão: condições que devem disparar ação
  decision_triggers_pt_br     text[]    not null default '{}',
  decision_triggers_en        text[]    not null default '{}',

  -- Movimento recomendado (síntese executiva do trend)
  recommended_move_pt_br      text,
  recommended_move_en         text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Garante ranks únicos por relatório
  unique (report_id, rank)
);

create index idx_report_trends_report_id   on report_trends(report_id);
create index idx_report_trends_taime_score on report_trends(taime_score desc);

create trigger trg_report_trends_updated_at
  before update on report_trends
  for each row execute function set_updated_at();


-- ============================================================
-- 6. USERS — Clientes (extensão do auth.users do Supabase)
-- ============================================================

create table users (
  -- Mesmo UUID do auth.users: identidade única via Supabase Auth
  id                 uuid        primary key references auth.users(id) on delete cascade,
  email              text        not null unique,
  full_name          text,
  company            text,
  job_title          text,
  -- Idioma preferido para exibição do relatório
  preferred_language text        not null default 'pt-BR'
                       check (preferred_language in ('pt-BR', 'en')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();


-- ============================================================
-- 7. SUBSCRIPTIONS — Plano e status Stripe por cliente
-- ============================================================

create table subscriptions (
  id                     uuid        primary key default uuid_generate_v4(),
  user_id                uuid        not null references users(id) on delete cascade,
  stripe_customer_id     text        unique,
  stripe_subscription_id text        unique,
  -- 'free' | 'starter' | 'pro' | 'enterprise'
  plan                   text        not null default 'free'
                           check (plan in ('free', 'starter', 'pro', 'enterprise')),
  -- Status espelhado do Stripe
  status                 text        not null default 'inactive'
                           check (status in ('active', 'inactive', 'trialing', 'past_due', 'canceled', 'unpaid')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_subscriptions_user_id            on subscriptions(user_id);
create index idx_subscriptions_stripe_customer_id on subscriptions(stripe_customer_id);
create index idx_subscriptions_status             on subscriptions(status);

create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();


-- ============================================================
-- 8. ADVISORY_MEMORY — Histórico de conversas do agente por cliente
--
-- context_metadata (JSONB) — referências do contexto da mensagem:
--   {
--     "report_id": "uuid",
--     "trend_ids": ["uuid", ...],
--     "topics": ["AI", "automação"],
--     "report_period": "2026-05-01"
--   }
-- ============================================================

create table advisory_memory (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid        not null references users(id) on delete cascade,
  -- Agrupa mensagens de uma mesma sessão de chat
  session_id       uuid        not null,
  -- 'user' | 'assistant'
  role             text        not null check (role in ('user', 'assistant')),
  content          text        not null,
  context_metadata jsonb       not null default '{}',
  created_at       timestamptz not null default now()
);

create index idx_advisory_memory_user_id    on advisory_memory(user_id);
create index idx_advisory_memory_session_id on advisory_memory(session_id);
-- Índice composto para buscar histórico cronológico de um usuário
create index idx_advisory_memory_user_history on advisory_memory(user_id, created_at asc);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table sources          enable row level security;
alter table signals          enable row level security;
alter table signal_clusters  enable row level security;
alter table reports          enable row level security;
alter table report_trends    enable row level security;
alter table users            enable row level security;
alter table subscriptions    enable row level security;
alter table advisory_memory  enable row level security;

-- Helper: verifica assinatura ativa do usuário corrente
-- security definer: executa como owner, não como o usuário — evita RLS recursivo
create or replace function is_active_subscriber()
returns boolean as $$
  select exists (
    select 1 from subscriptions
    where user_id = auth.uid()
      and status in ('active', 'trialing')
  );
$$ language sql security definer stable;

-- SOURCES: leitura por qualquer autenticado; escrita apenas via service_role
create policy "Authenticated users can read sources"
  on sources for select to authenticated
  using (true);

-- SIGNALS: leitura por qualquer autenticado
create policy "Authenticated users can read signals"
  on signals for select to authenticated
  using (true);

-- SIGNAL_CLUSTERS: leitura por qualquer autenticado
create policy "Authenticated users can read signal clusters"
  on signal_clusters for select to authenticated
  using (true);

-- REPORTS: apenas relatórios publicados, apenas para assinantes ativos
create policy "Active subscribers can read published reports"
  on reports for select to authenticated
  using (
    status = 'published'
    and is_active_subscriber()
  );

-- REPORT_TRENDS: assinantes ativos + relatório publicado
create policy "Active subscribers can read report trends"
  on report_trends for select to authenticated
  using (
    is_active_subscriber()
    and exists (
      select 1 from reports r
      where r.id = report_trends.report_id
        and r.status = 'published'
    )
  );

-- USERS: cada usuário gerencia apenas seu próprio perfil
create policy "Users can view own profile"
  on users for select to authenticated
  using (id = auth.uid());

create policy "Users can insert own profile"
  on users for insert to authenticated
  with check (id = auth.uid());

create policy "Users can update own profile"
  on users for update to authenticated
  using (id = auth.uid());

-- SUBSCRIPTIONS: cada usuário vê apenas sua assinatura
create policy "Users can view own subscription"
  on subscriptions for select to authenticated
  using (user_id = auth.uid());

-- ADVISORY_MEMORY: cada usuário acessa apenas seu próprio histórico
create policy "Users can view own advisory memory"
  on advisory_memory for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own advisory memory"
  on advisory_memory for insert to authenticated
  with check (user_id = auth.uid());


-- ============================================================
-- SEED: Fontes tier-1/2 (dados de configuração, não de usuário)
-- Categorias: research | consulting | vc | media | academic
--             think_tank | vendor | security
-- ============================================================

-- Bloco original — 25 fontes
insert into sources (name, url, tier, category) values
  -- Pesquisa & Consulting
  ('Gartner',                     'https://www.gartner.com',              1, 'research'),
  ('McKinsey & Company',          'https://www.mckinsey.com/insights',    1, 'consulting'),
  ('Boston Consulting Group',     'https://www.bcg.com/publications',     1, 'consulting'),
  ('Forrester Research',          'https://www.forrester.com',            1, 'research'),
  ('IDC',                         'https://www.idc.com',                  1, 'research'),
  ('Deloitte Insights',           'https://www2.deloitte.com/insights',   1, 'consulting'),
  ('PwC Technology',              'https://www.pwc.com/technology',       1, 'consulting'),

  -- Venture Capital
  ('a16z (Andreessen Horowitz)',   'https://a16z.com',                     1, 'vc'),
  ('Y Combinator',                'https://www.ycombinator.com/blog',     1, 'vc'),
  ('Sequoia Capital',             'https://www.sequoiacap.com/ideas',     1, 'vc'),
  ('First Round Capital',         'https://review.firstround.com',        1, 'vc'),
  ('Bessemer Venture Partners',   'https://www.bvp.com',                  1, 'vc'),

  -- Acadêmico
  ('MIT Technology Review',       'https://www.technologyreview.com',     1, 'academic'),
  ('Harvard Business Review',     'https://hbr.org',                      1, 'academic'),
  ('Stanford HAI',                'https://hai.stanford.edu',             1, 'academic'),
  ('MIT CSAIL',                   'https://www.csail.mit.edu',            1, 'academic'),

  -- Mídia especializada
  ('Wired',                       'https://www.wired.com',                1, 'media'),
  ('TechCrunch',                  'https://techcrunch.com',               1, 'media'),
  ('The Economist – Technology',  'https://www.economist.com/technology', 1, 'media'),
  ('Bloomberg Technology',        'https://www.bloomberg.com/technology', 1, 'media'),
  ('Financial Times – Tech',      'https://www.ft.com/technology',        1, 'media'),

  -- Think Tanks & Inteligência de Mercado
  ('World Economic Forum',        'https://www.weforum.org',              1, 'think_tank'),
  ('OECD',                        'https://www.oecd.org/digital',         1, 'think_tank'),
  ('CB Insights',                 'https://www.cbinsights.com/research',  1, 'research'),
  ('PitchBook',                   'https://pitchbook.com/news',           1, 'research');

-- Bloco de expansão — 25 novas fontes (research, consulting, vendor, media, security, academic)
insert into sources (name, url, tier, category) values
  -- Research & Advisory
  ('ISG',                           'https://isg-one.com',                                        1, 'research'),
  ('Everest Group',                 'https://www.everestgrp.com',                                 1, 'research'),
  ('451 Research (S&P Global)',     'https://451research.com',                                    1, 'research'),
  ('Accenture Technology Vision',   'https://www.accenture.com/us-en/insights/technology',        1, 'consulting'),

  -- Big Tech & Vendor Signals
  ('Microsoft Azure Blog',          'https://azure.microsoft.com/en-us/blog',                     1, 'vendor'),
  ('AWS News Blog',                 'https://aws.amazon.com/blogs/aws',                           1, 'vendor'),
  ('Google Cloud Blog',             'https://cloud.google.com/blog',                              1, 'vendor'),
  ('OpenAI News',                   'https://openai.com/news',                                    1, 'vendor'),
  ('Anthropic News',                'https://www.anthropic.com/news',                             1, 'vendor'),
  ('NVIDIA Blog',                   'https://blogs.nvidia.com',                                   1, 'vendor'),
  ('IBM Research',                  'https://research.ibm.com',                                   1, 'research'),
  ('Oracle News',                   'https://www.oracle.com/news',                                2, 'vendor'),
  ('SAP News Center',               'https://news.sap.com',                                       2, 'vendor'),

  -- Financial & Market Media
  ('Reuters Technology',            'https://www.reuters.com/technology',                         1, 'media'),
  ('CNBC Technology',               'https://www.cnbc.com/technology',                            2, 'media'),

  -- Engineering & Technical
  ('Thoughtworks Technology Radar', 'https://www.thoughtworks.com/radar',                         1, 'research'),
  ('InfoQ',                         'https://www.infoq.com',                                      2, 'media'),
  ('CNCF Blog',                     'https://www.cncf.io/blog',                                   2, 'research'),
  ('Linux Foundation',              'https://www.linuxfoundation.org/blog',                       2, 'research'),

  -- Cybersecurity
  ('CrowdStrike Blog',              'https://www.crowdstrike.com/blog',                           1, 'security'),
  ('Palo Alto Unit 42',             'https://unit42.paloaltonetworks.com',                        1, 'security'),
  ('Cisco Talos',                   'https://blog.talosintelligence.com',                         1, 'security'),
  ('Mandiant Blog',                 'https://www.mandiant.com/resources/blog',                    1, 'security'),

  -- Academic
  ('arXiv CS & AI',                 'https://arxiv.org/list/cs.AI/recent',                       2, 'academic'),
  ('Nature Technology',             'https://www.nature.com/subjects/technology',                 1, 'academic');
