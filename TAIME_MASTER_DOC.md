# TAIME — Documentação Mestre do Projeto

> Referência única e autoritativa. Atualizada em: 2026-05-22.
> Cobre pipeline (`/claude-taime/`) e frontend (`taime-web/`).

---

## 1. O QUE É O TAIME

**TAIME é inteligência estratégica em tecnologia democratizada para PMEs.**

O equivalente funcional do que firmas de research como Gartner, Forrester e McKinsey oferecem a grandes corporações — mas acessível a executivos, gestores, consultores e empreendedores que precisam decidir com contexto, não apenas com ruído.

### Posicionamento

| Dimensão | TAIME |
|---|---|
| **O que entrega** | Relatórios de inteligência com scoring, framework de decisão e análise temporal |
| **Para quem** | Executivos, gestores, consultores, empreendedores |
| **Diferencial central** | 25 anos de memória estratégica com granularidade crescente |
| **Modelo** | Coleta automatizada + análise por IA + revisão editorial humana |
| **Idiomas** | PT-BR e EN (geração nativa bilíngue, não tradução) |

### Missão

> Democratizar a inteligência estratégica em tecnologia.
> Tornar acessível o tipo de análise que antes exigia orçamentos de consultoria enterprise.

### O problema que o TAIME resolve

1. **Volume sem estrutura** — Toda semana surgem novas tecnologias, tendências e alertas. Sem estrutura, isso é ruído, não inteligência.
2. **Decisões sem contexto** — Adotar cedo demais desperdiça capital. Tarde demais perde terreno competitivo. O timing é tudo.
3. **Sem memória estratégica** — Mercados repetem padrões. Quem conhece a história decide melhor.

---

## 2. PRODUTO — TRÊS CAMADAS

### Camada 1 — Relatórios de Inteligência

Publicados conforme a era (mensal, quinzenal ou semanal). Cada relatório contém:

- **3 a 5 trends** identificadas por clustering de sinais
- **TAIME Score (0–100)** por trend com justificativa semântica
- **Framework TYPE → ACT → IMPACT → MOVE → EXIT** por trend
- **THEN / NOW / NEXT** — inteligência temporal
- **Implicações organizacionais** por área (Tecnologia, RH, Finanças, Marketing, Operações)
- **Gatilhos de decisão** — condições que devem disparar ação imediata
- **Sumário executivo** bilíngue (PT-BR + EN)

### Camada 2 — Arquivo Histórico

Cobre 2000 até o presente com granularidade crescente por era:

| Era | Frequência | Dias de início de período |
|---|---|---|
| 2000–2014 | Mensal | 01 |
| 2015–2021 | Quinzenal | 01 e 16 |
| 2022+ | Semanal | 01, 08, 16, 24 |

A PERIOD key é sempre a data de início do período no formato `YYYY-MM-DD`.

O arquivo completo está em construção progressiva e será disponibilizado a assinantes do plano Estratégico ao longo de 2026.

### Camada 3 — Executive Advisor

Chat estratégico contextualizado com IA (Claude claude-sonnet-4-6):

- **Perfil da empresa** coletado em onboarding de 4 etapas (empresa, infraestrutura, objetivo, maturidade)
- **Contexto de inteligência**: system prompt inclui os 3 últimos relatórios publicados
- **Memória de sessão**: histórico das últimas 20 mensagens por sessão, com múltiplas sessões por usuário
- **Resposta idiomática**: detecta o idioma da mensagem e responde no mesmo
- Acesso atual: todos os usuários autenticados — TODO: restringir a pagantes quando Stripe estiver ativo

---

## 3. FRAMEWORK TAIME

### TAIME Score (0–100)

Score de convergência estratégica calculado sobre 5 dimensões:

| Dimensão | Campo | Descrição |
|---|---|---|
| Maturidade de mercado | `market_maturity` | Nível de adoção e consolidação da tecnologia |
| Pressão competitiva | `competitive_pressure` | Velocidade de movimento dos concorrentes |
| Impacto estratégico | `strategic_impact` | Profundidade da mudança nas operações e modelo de negócio |
| Complexidade de execução | `execution_complexity` | Dificuldade de implementar (escala invertida) |
| Risco de atraso competitivo | `competitive_lag_risk` | Custo de não agir agora |

**Interpretação:**
- **80–100**: Prioridade executiva imediata
- **60–79**: Alta relevância, planejar no próximo ciclo
- **40–59**: Monitoramento ativo
- **< 40**: Observação

**Invariante de consistência**: `taime_score` e todos os `score_dimensions[*].score` são idênticos em PT e EN. Garantido por dois mecanismos: constraints no prompt EN + override programático via `enforceScoresFromPt()`.

### TYPE → ACT → IMPACT → MOVE → EXIT

Framework de decisão aplicado a cada trend:

| Campo | Conteúdo |
|---|---|
| **TYPE** | Tipo de cenário (disrupção, risco, oportunidade, janela de transição) |
| **ACT** | Nível de urgência para ação (imediata, planejada, monitoramento) |
| **IMPACT** | Dimensões organizacionais afetadas |
| **MOVE** | Movimento racional recomendado |
| **EXIT** | Critérios de escalonamento ou saída |

### THEN / NOW / NEXT

Camada de inteligência temporal:

| Campo | Conteúdo |
|---|---|
| **THEN** | Como o mercado interpretou o sinal no passado |
| **NOW** | O que realmente importa hoje com perspectiva acumulada |
| **NEXT** | Para onde o padrão aponta: próxima inflexão estratégica |

---

## 4. PIPELINE TÉCNICO

### Visão geral do fluxo

```
Serper API → signals → signal_clusters → report_trends + reports
     ↑              ↑                ↑
  collect-signals  analyze-signals  generate-report
```

### Scripts em `/claude-taime/`

#### `collect-signals.ts`
Coleta artigos via Serper API para cada fonte cadastrada.

- **Período atual** (`qdr:m`): `tbs: 'qdr:m'` — últimos 30 dias
- **Período histórico** (`isHistorical()` → true): `tbs: 'cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY'`
- Metadata de cada signal inclui: `period_label`, `period_type`, `period_start`, `period_end`, `is_historical`
- Usa `service_role` key para bypass de RLS

Uso: `PERIOD=2026-05-01 npx ts-node collect-signals.ts`

#### `analyze-signals.ts`
Clustering dos signals por tema com Claude claude-sonnet-4-6.

- Gera 3–5 clusters temáticos por período
- Envia índices numéricos ao LLM (não UUIDs) para reduzir tokens
- Salva em `signal_clusters` com `signal_ids[]` e `llm_reasoning`

Uso: `PERIOD=2026-05-01 npx ts-node analyze-signals.ts`

#### `generate-report.ts`
Geração do relatório completo em PT-BR e EN.

- Chama Claude claude-sonnet-4-6 por trend (PT primeiro, EN com referência de scores)
- `enforceScoresFromPt(en, pt)` sobrescreve todos os scores numéricos do EN com os valores canônicos do PT
- `verifyScores()` detecta e loga divergências residuais
- Confidencialidade de fontes: `confidence_basis` usa apenas categorias genéricas (não nomes de firmas)
- Persiste em `reports` + `report_trends` via service_role

Uso: `PERIOD=2026-05-01 npx ts-node generate-report.ts`

#### `period-utils.ts`
Utilitário compartilhado de períodos históricos.

Funções exportadas:
- `getPeriodType(year)` → `'monthly' | 'biweekly' | 'weekly'`
- `parsePeriod(periodKey: string)` → `PeriodInfo` com start, end, type, labelPt, labelEn
- `generatePeriods(from, to)` → lista completa de todos os períodos no intervalo
- `isHistorical(info)` → true se o fim do período > 45 dias atrás
- `toSerperDate(d)` → formato `MM/DD/YYYY` do Serper

Exemplos de labels:
- Semanal: `"Semana 1 de Maio de 2026"` / `"First Week of May 2026"`
- Quinzenal: `"1ª Quinzena de Março de 2018"` / `"First Half of March 2018"`
- Mensal: `"Outubro de 2008"` / `"October 2008"`

#### `generate-periods.ts`
CLI para gerar a lista de períodos de um intervalo.

Uso: `npx ts-node generate-periods.ts 2026-01-01 2026-05-31`
Output: imprime lista agrupada + salva `batch-periods.json`

#### `batch-pipeline.ts`
Orquestrador do pipeline histórico em lote.

- Lê períodos de `batch-periods.json` ou argumento de data range
- Flag `--resume` retoma do último ponto salvo em `batch-progress.json`
- Por período: verifica idempotência no banco → collect → analyze → generate
- 15s de delay entre períodos (respeita rate limits)
- Log claro: `[3/24] Processando: Semana 2 de Abril/2026 (2026-04-08)`
- Progresso em `batch-progress.json`: `{ completed: [], failed: [], pending: [] }`

#### `add-sources.ts`
Seed das 50 fontes tier-1/2 no banco. Rodar uma vez.

---

## 5. ARQUITETURA DO BANCO

**Supabase** (PostgreSQL 15+). Project ref: `udcyimlxjjzlozmfvufb`.

RLS ativo em todas as tabelas. Pipeline usa `service_role` (bypass RLS). Frontend usa `anon` key (respeita RLS).

### Tabelas

#### `sources`
Fontes de coleta cadastradas (50 fontes em 8 categorias).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| name | text | Nome da fonte |
| url | text | URL base |
| tier | smallint | 1 (primária) a 3 |
| category | text | research, consulting, vc, media, academic, think_tank, vendor, security |
| active | boolean | Default true |

#### `signals`
Artigos coletados por período via Serper.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| source_id | uuid | FK → sources |
| period | date | Primeiro dia do período (YYYY-MM-DD) |
| title | text | Título do artigo |
| url | text | |
| content | text | |
| summary | text | Resumo gerado pelo LLM |
| metadata | jsonb | Campos extras do Serper + period_label, period_type, is_historical |

#### `signal_clusters`
Grupos temáticos identificados pelo LLM.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| period | date | |
| name | text | Nome do cluster |
| description | text | |
| signal_ids | uuid[] | Array de IDs dos signals |
| llm_reasoning | text | Chain-of-thought do LLM |

#### `reports`
Um relatório por período (metadados).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| period | date | UNIQUE — um relatório por período |
| status | text | draft → generating → published → archived |
| title_pt_br | text | |
| title_en | text | |
| executive_summary_pt_br | text | |
| executive_summary_en | text | |
| period_label | text | Ex: "Semana 1 de Maio de 2026" (add-period-columns.sql) |
| period_type | text | weekly / biweekly / monthly (add-period-columns.sql) |
| period_start | date | Início do período (add-period-columns.sql) |
| period_end | date | Fim do período (add-period-columns.sql) |
| published_at | timestamptz | |

#### `report_trends`
3–5 trends por relatório com análise completa.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| report_id | uuid | FK → reports (cascade) |
| signal_cluster_id | uuid | FK → signal_clusters |
| rank | smallint | 1 = mais relevante (unique por relatório) |
| title_pt_br / title_en | text | |
| taime_score | smallint | 0–100 (canônico — idêntico para PT e EN) |
| taime_score_rationale_pt_br / en | text | |
| taime_framework_pt_br / en | jsonb | {type, act, impact, move, exit} |
| then_now_next_pt_br / en | jsonb | {then, now, next} |
| org_implications_pt_br / en | jsonb | {technology, hr, finance, marketing, operations} |
| decision_triggers_pt_br / en | text[] | Lista de gatilhos |
| recommended_move_pt_br / en | text | |

#### `users`
Extensão do `auth.users` do Supabase.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK = FK auth.users |
| email | text | |
| full_name | text | |
| company | text | |
| job_title | text | |
| preferred_language | text | pt-BR (default) / en |

#### `subscriptions`
Plano e status Stripe por cliente.

| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid | FK → users |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| plan | text | free / starter / pro / enterprise |
| status | text | active / inactive / trialing / past_due / canceled / unpaid |

#### `advisor_profiles`
Perfil empresarial coletado no onboarding do Advisor.

| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid | PK + FK → users (UNIQUE) |
| company_name | text | |
| sector | text | |
| company_size | text | |
| annual_revenue | text | Opcional |
| current_infrastructure | text | Texto livre + checkboxes |
| strategic_objective | text | |
| maturity_level | text | Inicial / Intermediário / Avançado |

#### `advisory_memory`
Histórico de conversas do Executive Advisor por sessão.

| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid | FK → users |
| session_id | uuid | Agrupa mensagens de uma sessão |
| role | text | user / assistant |
| content | text | |
| context_metadata | jsonb | {report_ids_used, profile_snapshot} |

### SQL scripts pendentes (rodar no Supabase SQL Editor)

- `/claude-taime/admins.sql` — tabela admins (autorização da área admin)
- `/claude-taime/add-period-columns.sql` — colunas period_label/type/start/end em reports
- `/claude-taime/taime-web/add-advisor-tables.sql` — tabelas advisor_profiles + advisory_memory

### RLS policies

- `sources`, `signals`, `signal_clusters`: leitura por qualquer autenticado
- `reports`, `report_trends`: apenas assinantes ativos (`is_active_subscriber()`) + status `published`
- `users`, `subscriptions`: cada usuário vê apenas seus próprios dados
- `advisor_profiles`, `advisory_memory`: cada usuário acessa apenas seus dados
- Pipeline: usa `service_role` (bypass de todas as policies)

---

## 6. REGRAS EDITORIAIS

### Confidencialidade de fontes

O campo `confidence_basis` **nunca** menciona nomes de fontes específicas. Categorias permitidas:

- `"global research institutes"`
- `"strategic consulting firms"`
- `"academic research centers"`
- `"technology industry publications"`
- `"venture capital firms"`
- `"enterprise technology vendors"`
- `"financial news organizations"`

Exemplo correto:
```
"18 signals from global research institutes and strategic consulting firms.
TAIME Score 87, high convergence across research and consulting categories."
```

Razão: preservar independência editorial e proteger o método proprietário de coleta.

### Paridade de scores PT = EN

O `taime_score` e os 5 `score_dimensions[*].score` são **obrigatoriamente idênticos** entre PT e EN para a mesma trend.

Mecanismo de garantia (dupla camada):
1. **Prompt EN**: bloco `MANDATORY SCORE CONSTRAINTS` com todos os 6 valores como inteiros fixos
2. **Override programático**: `enforceScoresFromPt(en, pt)` em `generate-report.ts` sobrescreve todos os scores do EN com os valores canônicos do PT após o parse do LLM

### Revisão editorial

Todo relatório passa por revisão humana antes de `status = 'published'`. TAIME não é automação pura.

### Acesso ao Advisor

Atualmente disponível a todos os usuários autenticados. **TODO**: restringir a assinantes pagos quando Stripe estiver ativo.

---

## 7. ESTRUTURA DE ARQUIVOS

### Pipeline — `/claude-taime/`

```
claude-taime/
├── collect-signals.ts       # Coleta via Serper API
├── analyze-signals.ts       # Clustering com Claude
├── generate-report.ts       # Geração bilíngue PT/EN
├── period-utils.ts          # Utilitário compartilhado de períodos
├── generate-periods.ts      # CLI: gera batch-periods.json
├── batch-pipeline.ts        # Orquestrador lote com retomada
├── add-sources.ts           # Seed de fontes tier-1
├── schema.sql               # Schema completo do banco
├── admins.sql               # ⚠ Rodar no Supabase SQL Editor
├── add-period-columns.sql   # ⚠ Rodar no Supabase SQL Editor
├── batch-periods.json       # Gerado por generate-periods.ts
├── batch-progress.json      # Estado do batch pipeline
├── package.json
├── tsconfig.json
├── LOG.md                   # Log de desenvolvimento
├── TAIME_MASTER_DOC.md      # Este documento
└── taime-web/               # Aplicação web Next.js
```

### Frontend — `taime-web/`

```
taime-web/
├── add-advisor-tables.sql       # ⚠ Rodar no Supabase SQL Editor
├── app/
│   ├── layout.tsx               # Root layout + Navbar + i18n
│   ├── page.tsx                 # Home page (12 seções, Server Component)
│   ├── login/page.tsx           # Waitlist + magic link (Client Component)
│   ├── sobre/page.tsx           # Sobre a TAIME (Server Component)
│   ├── planos/page.tsx          # Planos e preços (Client Component)
│   ├── contato/page.tsx         # Formulário de contato (Client Component)
│   ├── about/page.tsx           # Alias EN de /sobre
│   ├── dashboard/
│   │   ├── page.tsx             # Lista de relatórios + card Advisor
│   │   └── advisor/
│   │       ├── page.tsx         # Server page: auth + load profile
│   │       └── AdvisorView.tsx  # Client: onboarding ou chat
│   ├── reports/[id]/page.tsx    # Visualização de relatório completo
│   ├── admin/waitlist/
│   │   ├── page.tsx             # Admin: aprovação de waitlist
│   │   └── WaitlistAdmin.tsx    # Client component do admin
│   ├── api/
│   │   ├── advisor/chat/route.ts    # POST: chat do Executive Advisor
│   │   ├── admin/approve/route.ts  # POST: aprovar usuário da waitlist
│   │   └── contact/route.ts        # POST: formulário de contato (Resend)
│   └── auth/callback/route.ts  # Callback do magic link Supabase
├── components/
│   ├── AdvisorOnboarding.tsx    # Formulário 4 etapas (Client)
│   ├── AdvisorChat.tsx          # Chat do Advisor (Client)
│   ├── DashboardClient.tsx      # Dashboard interativo (Client)
│   ├── ReportClient.tsx         # Visualização de trend (Client)
│   ├── Navbar.tsx               # Nav com i18n + auth state
│   ├── LanguageSelector.tsx     # Toggle PT/EN (cookie taime-locale)
│   ├── LogoutButton.tsx         # Logout via Supabase
│   └── FaqAccordion.tsx         # Accordion FAQ
└── lib/
    ├── i18n/
    │   ├── index.ts             # getTranslations(), detectLocale(), DeepMutable<T>
    │   ├── pt.ts                # Traduções PT-BR (as const — fonte canônica)
    │   └── en.ts                # Traduções EN (typed via Translations)
    ├── supabase/
    │   ├── server.ts            # createServerClient (cookies)
    │   └── client.ts            # createBrowserClient
    ├── isAdmin.ts               # Verifica tabela admins (fallback: email hardcoded)
    └── useLocale.ts             # Hook: lê taime-locale do document.cookie
```

---

## 8. PLANO DE NEGÓCIO

### Planos

| Plano | Preço | Público |
|---|---|---|
| **Free** | Gratuito | Preview público de relatórios, sem login |
| **Essencial** | R$ 197/mês | Relatório completo + histórico 90 dias |
| **Estratégico** | R$ 497/mês | Tudo do Essencial + semanal + arquivo desde 2000 |

### Detalhamento por plano

**Free (sem login)**
- Preview do último relatório publicado
- Score geral do período
- Sem acesso ao framework, implicações ou gatilhos

**Essencial — R$ 197/mês**
- Relatório completo (3–5 trends)
- Framework TYPE→ACT→IMPACT→MOVE→EXIT
- Dimensões do score detalhadas
- THEN / NOW / NEXT
- Implicações organizacionais + gatilhos
- Histórico de 90 dias

**Estratégico — R$ 497/mês**
- Tudo do Essencial
- Relatórios semanais (2022+)
- Arquivo histórico completo desde 2000
- Early access ao próximo ciclo

### Pagamentos

Stripe ainda não integrado. Ao integrar:
- Atualizar tabela `subscriptions` com `stripe_customer_id` / `stripe_subscription_id`
- Restringir `reports` / `report_trends` RLS a assinantes ativos
- Restringir `/api/advisor/chat` a assinantes pagos
- Implementar webhook `/api/stripe/webhook` para sincronizar status

### Planos futuros (roadmap)

- Planos anuais com desconto de até 20% — 2º semestre 2026
- Planos corporativos (3+ usuários) — 2º semestre 2026

### Admin

- Email admin: `claudineicanei1@gmail.com`
- Aprovação manual de waitlist via `/admin/waitlist`
- Verificação: tabela `admins` (com fallback ao email hardcoded em `lib/isAdmin.ts`)

### Formulário de contato

- API: Resend, FROM `onboarding@resend.dev`, TO `contato@taime.tech`
- Endpoint: `POST /api/contact`

---

## 9. ROADMAP

### Prioritário

- [ ] **Stripe integration** — pagamentos Essencial e Estratégico
  - Webhook de sincronização de status
  - Restrição de RLS em reports/report_trends para assinantes ativos
  - Restrição do Advisor a pagantes

- [ ] **Arquivo histórico** — processamento progressivo 2000–2022
  - Batch pipeline já implementado (`batch-pipeline.ts`)
  - Pendente: execução do pipeline para todos os períodos históricos
  - Disponibilização a assinantes Estratégico

### Infraestrutura

- [ ] Executar `admins.sql` no Supabase SQL Editor
- [ ] Executar `add-period-columns.sql` no Supabase SQL Editor
- [ ] Executar `add-advisor-tables.sql` no Supabase SQL Editor

### Produto (2º semestre 2026)

- [ ] Planos anuais com desconto (~20%)
- [ ] Planos corporativos (3+ usuários)
- [ ] i18n do Executive Advisor (atualmente detecta idioma automaticamente, mas onboarding é PT)
- [ ] Notificações por email ao publicar novo relatório (Resend)
- [ ] Área de perfil do usuário no dashboard (`/dashboard/profile`)

### Concluído

- [x] Pipeline técnico completo (collect → analyze → generate)
- [x] Batch pipeline histórico com retomada de progresso
- [x] Geração bilíngue nativa PT/EN com paridade de scores garantida
- [x] Confidencialidade de fontes no `confidence_basis`
- [x] Executive Advisor v1 (onboarding + chat + memória)
- [x] i18n PT/EN completo em todas as páginas
- [x] Dashboard com card Advisor + badge NOVO
- [x] Admin: aprovação manual de waitlist
- [x] 50 fontes tier-1/2 em 8 categorias

---

## 10. STATUS ATUAL

> Extraído do LOG.md. Referência: 2026-05-22.

### Último relatório publicado

- **Período**: 2026-05-01
- **ID**: `295d6a42-0f53-414c-9dbe-25267099bc14`
- **Scores**: 87, 85, 84, 83, 72 (média: 82)
- **Status**: verificação PT=EN confirmada para todos os 5 trends

### Entregas em produção

| Data | Entrega |
|---|---|
| 2026-05-21 | generate-report.ts: 2 bugs críticos corrigidos (scores PT≠EN + nomes de fontes) |
| 2026-05-21 | Executive Advisor v1 (AdvisorOnboarding + AdvisorChat + /api/advisor/chat) |
| 2026-05-21 | Batch pipeline histórico (period-utils, generate-periods, batch-pipeline) |
| 2026-05-21 | i18n PT/EN completo (login, sobre, planos, contato) |
| 2026-05-21 | Correção de tipos i18n (DeepMutable<T> + tipagem de en.ts) |
| 2026-05-22 | TAIME_MASTER_DOC.md criado |

### SQL pendente (ação humana necessária)

Execute no **Supabase Dashboard → SQL Editor → New Query**:

1. `/claude-taime/admins.sql`
2. `/claude-taime/add-period-columns.sql`
3. `/claude-taime/taime-web/add-advisor-tables.sql`

### Stack em produção

| Componente | Tecnologia | Versão/Detalhe |
|---|---|---|
| Frontend | Next.js App Router | v14 |
| Database | Supabase | project: `udcyimlxjjzlozmfvufb` |
| LLM | Claude | claude-sonnet-4-6 |
| Search | Serper API | Google Search wrapper |
| Email | Resend | FROM: onboarding@resend.dev |
| CSS | Tailwind CSS | tema taime-600 personalizado |
| Pagamentos | Stripe | não integrado (TODO) |
| i18n | Custom (sem biblioteca) | cookie `taime-locale`, PT/EN |
