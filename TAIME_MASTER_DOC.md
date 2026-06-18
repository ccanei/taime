# TAIME — Documentação Mestre do Projeto

> Referência única e autoritativa. Atualizada em: 2026-05-31.
> Cobre pipeline (`/claude-taime/`) e frontend (`taime-web/`).
> Este documento é suficiente para qualquer sessão futura continuar o trabalho sem contexto adicional.

-----

## 1. O QUE É O TAIME

**TAIME é inteligência estratégica em tecnologia democratizada — para qualquer pessoa que decide com base em tecnologia.**

O equivalente funcional do que firmas como Gartner, Forrester e McKinsey oferecem a grandes corporações — mas acessível a líderes, gestores, consultores e empreendedores de qualquer porte, do MEI à multinacional.

### Origem da ideia

Em 2024, analisando o movimento do mercado de inteligência estratégica, ficou evidente uma contradição: as plataformas que deveriam ajudar organizações a navegar a aceleração tecnológica estavam elas próprias ficando para trás. O Gartner caiu de $45B para $12B de market cap. Relatórios estáticos, ciclos longos de produção, ausência de contexto histórico.

A pergunta que originou o TAIME foi simples: e se fosse possível pegar o histórico tecnológico dos últimos 25 anos, entender os padrões que se repetem, conectar com o que está acontecendo hoje e estruturar isso como orientação de movimento — não apenas como informação?

### Posicionamento

|Dimensão               |TAIME                                                                          |
|-----------------------|-------------------------------------------------------------------------------|
|**O que entrega**      |Relatórios de inteligência com scoring, framework de decisão e análise temporal|
|**Para quem**          |Líderes, gestores, consultores, empreendedores — qualquer porte                |
|**Diferencial central**|25 anos de memória estratégica com granularidade crescente                     |
|**Modelo**             |Coleta automatizada + análise por IA + revisão editorial humana                |
|**Idiomas**            |PT-BR e EN (geração nativa bilíngue, não tradução)                             |

-----

## 2. PRODUTO — TRÊS CAMADAS

### Camada 1 — Radar TAIME (feed diário)

Notícias das últimas 24h das 110 fontes globais validadas, processadas por IA:

- Título + resumo de 2 linhas
- Categoria (IA, Cloud, Cybersecurity, Market, Infrastructure, Regulation, Fintech)
- Fonte por categoria (nunca por nome)
- Link para a fonte original
- Atualizado automaticamente 2x ao dia (07h e 14h BRT) via Vercel Cron

### Camada 2 — Relatórios de Inteligência (quinzenal)

Publicados conforme a era. Cada relatório contém:

- **4 a 12 trends** identificadas por clustering de sinais (divisão automática em 2 relatórios quando > 7 clusters)
- **TAIME Score (0–100)** por trend com justificativa semântica em 5 dimensões
- **Framework TYPE → ACT → IMPACT → MOVE → EXIT** por trend
- **THEN / NOW / NEXT** — inteligência temporal com ponto de inflexão estratégico
- **Contra-tese** (opcional) — apenas quando sinais suportam condição genuína de não-ação
- **Implicações organizacionais** por área (Liderança, Tecnologia, Operações, Finanças, Pessoas)
- **Gatilhos de decisão** — condições que devem disparar ação imediata
- **Sumário executivo** bilíngue (PT-BR + EN)

#### Dashboard de leitura (personalização por usuário)

A dashboard que lista os relatórios tem uma camada de orientação por cima da lista:

- **Continuar lendo** — retoma o último relatório aberto e não concluído, rolando automaticamente até o ponto onde o usuário parou (progresso de scroll salvo por usuário/relatório).
- **Ler depois** — relatórios salvos manualmente via ícone de marcador (bookmark) nos cards; bloco dedicado no topo.
- **Recomendados** — sugestão automática de relatórios não lidos, derivada do tema (categoria) dominante das últimas 5 leituras do usuário.
- **Filtro por categoria (chips)** — chips acima da lista filtram relatórios por categoria (mostra o relatório se qualquer trend dele for da categoria). Convivem com busca por título e filtro de período.
- Toda personalização é por usuário, com RLS — ver tabelas `reading_progress` e `saved_reports` na seção 7.

### Camada 3 — Executive Advisor (em breve)

Chat estratégico contextualizado com IA (Claude Sonnet 4.6):

- **Perfil da empresa** coletado em onboarding de 4 etapas
- **Contexto de inteligência**: system prompt inclui os 3 últimos relatórios publicados
- **Memória de sessão**: histórico das últimas 20 mensagens, múltiplas sessões por usuário
- **Resposta idiomática**: detecta o idioma da mensagem e responde no mesmo
- **Visão futura**: planos estratégicos personalizados, acompanhamento semanal automático

### Camada 4: Newsletter do Radar (envio diário)

Implementada. A captura de inscritos vive em `/radar` (componente `NewsletterSignup`) e o envio é diário, automático, com histórico próprio.

**Fluxo real**:

1. **Briefing diário** já existe via `/api/cron/radar-briefing` (11:00 UTC, 08:00 BRT). Gera 1 linha em `radar_briefings` com `title_pt/en` e `body_pt/en` a partir dos sinais das últimas 24h. Idempotente por `briefing_date`.
2. **Envio** roda 30 min depois em `/api/cron/newsletter-send` (11:30 UTC, 08:30 BRT). Lê o briefing do dia, lista os inscritos ativos, monta um e-mail por idioma (template dark table-based, mesmo padrão visual dos e-mails de aprovação) e dispara em lotes via endpoint `/emails/batch` do Resend (até 100 por chamada). Skip seguro quando: não há briefing do dia, não há ativos, ou o envio do dia já saiu (idempotência por `briefing_date` + status `sent` ou `partial`).
3. **Rodapé** carrega link de unsubscribe por inscrito, derivado do `unsubscribe_token` da `newsletter_subscribers`. Clicar marca `status='unsubscribed'` e a página de confirmação é bilíngue (`/api/newsletter/unsubscribe?token=...`). Token inválido cai em página neutra que não revela se o e-mail existe.
4. **Histórico** próprio. Cada envio grava 1 linha em `newsletter_sends` com snapshot do conteúdo (subject + body PT e EN) e contagens (`recipient_count`, `sent_count`, `failed_count`, `status`). Cada destinatário do envio vira 1 linha em `newsletter_send_recipients` com `delivered` e `error`. O snapshot é deliberado: preserva o que foi enviado mesmo que o briefing seja editado depois.
5. **Admin** em `/admin/newsletter` com duas seções: Inscritos (filtros por status, busca por email, bloquear/reativar/remover com rastro de quem mudou e quando) e Envios (cada envio expansível, mostrando conteúdo enviado e a lista de destinatários por GET sob demanda). Inscrição já entra `active`, sem fila de aprovação. Ver seção 12 (Admin) e seção 7 (Banco).

-----

## 3. FRAMEWORK TAIME

### TAIME Score (0–100)

Score de **urgência estratégica semântica** ("Semantic Urgency"), resultado de **julgamento analítico ponderado** sobre 5 dimensões. NÃO é fórmula nem média aritmética (ver detalhamento em "Como o Score é gerado e auditado", abaixo):

|Dimensão            |Descrição                                                |
|--------------------|---------------------------------------------------------|
|Market Maturity     |Nível de adoção e consolidação da tecnologia             |
|Competitive Pressure|Velocidade de movimento dos concorrentes                 |
|Strategic Impact    |Profundidade da mudança nas operações e modelo de negócio|
|Execution Complexity|Dificuldade de implementar (escala invertida)            |
|Competitive Lag Risk|Custo de não agir agora                                  |

**Interpretação:**

- **80–100**: Prioridade executiva imediata
- **60–79**: Alta relevância, planejar no próximo ciclo
- **40–59**: Monitoramento ativo
- **< 40**: Observação

**Invariante de consistência**: `taime_score` e os 5 `score_dimensions` são OBRIGATORIAMENTE idênticos em PT e EN.

### TYPE → ACT → IMPACT → MOVE → EXIT

|Campo             |Conteúdo                                                         |
|------------------|-----------------------------------------------------------------|
|**TYPE**          |Tipo de cenário com contexto explicativo (não apenas uma palavra)|
|**ACT**           |Nível de urgência com justificativa                              |
|**IMPACT**        |Dimensões organizacionais afetadas com detalhe                   |
|**MOVE**          |Movimento racional orientado à AÇÃO, sem sujeito hierárquico     |
|**EXIT**          |Critérios de captura de oportunidade e de janela perdida         |
|**COUNTER-THESIS**|Opcional: condição específica em que a ação seria errada         |

### THEN / NOW / NEXT

|Campo   |Regras de escrita                                                                                                                        |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------|
|**THEN**|Ponto de inflexão estratégico — quando o consenso estava errado. Datas ABSOLUTAS. Nunca “há X meses”. Inclui PERIOD_LABEL como subtítulo.|
|**NOW** |Estado do mercado NO período do relatório. Present tense ancorado naquela data.                                                          |
|**NEXT**|Projeção com “sinais apontavam para…”, “a trajetória sugeria…”. NUNCA certeza ou hindsight.                                              |

### Como o Score é gerado e auditado

_Documentado em 2026-06-16. Fonte: SYSTEM_PROMPT e lógica de `generate-report.ts`, validado contra dados reais do report `a1452c28` (período 2026-06-01)._

**Natureza do score.** O TAIME Score (0–100) de uma trend é uma medida de urgência estratégica semântica, produzida por **julgamento ponderado de especialista — NÃO uma fórmula e NÃO a média aritmética** das dimensões (SYSTEM_PROMPT: "Overall score = weighted expert judgment, not arithmetic mean"). Não existe valor "correto" calculável: duas trends podem ter o mesmo score geral (ex: 84) por combinações de dimensões completamente diferentes. A ponderação entre dimensões é decidida pelo modelo trend a trend, conforme qual fator domina o quadro. Temperatura de geração: **0.1**.

**Faixas semânticas das dimensões.** Cada dimensão recebe `{ score: 0-100, label: "RÓTULO EM CAPS" }`. Exemplo das faixas de Market Maturity: 0–30 Lab · 31–60 Early production · 61–85 Scaling · 86–100 Table stakes. As dimensões dominantes (apontadas no rationale como "fator dominante") puxam o geral mais que as demais e aparecem com destaque visual no site (verde para altas/dominantes, laranja para menores). Não há peso fixo por dimensão: o peso é contextual a cada trend.

**SCORING SCOPE.** Pontua relativo ao mercado **global** por padrão. Quando os sinais são predominantemente regionais/setoriais, pontua dentro daquele escopo E o declara explicitamente no `taime_score_rationale` (ex: "maturidade avaliada dentro do mercado brasileiro").

**Fluxo de geração (PT canônico → EN herda).** (1) A análise PT-BR gera os valores canônicos (`taime_score` + 5 `score_dimensions`). (2) A geração EN recebe esses números como constraints fixos e gera apenas os labels em inglês, proibida de recalcular. (3) Enforcement duplo (`enforceScoresFromPt()` + `verifyScores()`) garante PT = EN nos números; só os labels mudam de idioma. Isso resolve o "BUG 1" histórico (scores divergentes PT/EN).

**ONDE VIVEM AS DIMENSÕES (crítico para auditoria).**
- A coluna `report_trends.score_dimensions` (jsonb) é **legada e fica vazia (`{}`)** em toda a base. NÃO usar — sempre retorna null.
- As dimensões reais ficam dentro do campo **`taime_framework_pt_br`** (e `taime_framework_en` para os labels em inglês), num objeto `score_dimensions` aninhado.
- O `taime_score_rationale_pt_br` é texto em prosa (nomeia as dimensões dominantes), NÃO contém o JSON estruturado de forma confiável. Não auditar por ele.
- O `taime_score` (geral da trend) é coluna própria em `report_trends` — esse é direto.

**Como auditar (3 testes de coerência, não de cálculo).**

_Teste 1 — Diferenciação interna (ancoragem vs. legítimo)._ Extrair as 5 dimensões e ver se variam:

```sql
SELECT rank, taime_score,
  substring(taime_framework_pt_br::text from '"market_maturity"[^}]*"score":\s*([0-9]+)')      AS maturidade,
  substring(taime_framework_pt_br::text from '"competitive_pressure"[^}]*"score":\s*([0-9]+)') AS pressao,
  substring(taime_framework_pt_br::text from '"strategic_impact"[^}]*"score":\s*([0-9]+)')      AS impacto,
  substring(taime_framework_pt_br::text from '"execution_complexity"[^}]*"score":\s*([0-9]+)')  AS complexidade,
  substring(taime_framework_pt_br::text from '"competitive_lag_risk"[^}]*"score":\s*([0-9]+)')   AS lag_risk
FROM report_trends
WHERE report_id = '<REPORT_ID>'
ORDER BY rank;
```

Scores gerais iguais (ex: vários 84) são LEGÍTIMOS se as dimensões por trás forem diferentes (cada trend chega ao mesmo geral por caminho distinto); são suspeitos de ANCORAGEM só se as cinco dimensões forem quase idênticas entre trends. Exemplo real (report `a1452c28`, quatro trends com geral 84): dimensões 72/82/80/68/78, 82/88/80/62/78, 72/80/85/68/82, 78/88/82/72/85 — perfis distintos, logo os 84 são legítimos (convergência real de período quente, não ancoragem).

_Teste 2 — Coerência score ↔ dimensões ↔ rationale ↔ faixa._ O rationale deve nomear as dimensões dominantes, e os labels devem bater com as faixas (ex: maturidade 72 → faixa "Scaling" 61-85).

_Teste 3 — Comparabilidade temporal (crítico)._ Um 84 em qualquer período deve significar a mesma régua que um 84 em outro ano. Ao mudar base de fontes ou comparar períodos, verificar se a régua não inflou. Quebra de comparabilidade temporal é a falha mais grave, pois o diferencial do TAIME é a memória estratégica comparável no tempo.

**Dívida técnica registrada.** Popular a coluna `score_dimensions` (hoje vazia) com o JSON extraído de `taime_framework_pt_br`, via migração, tornaria as dimensões consultáveis de forma limpa (`score_dimensions->>'market_maturity'`) — beneficiando auditoria, filtros por dimensão e o Executive Advisor. Não urgente; recomendado antes de o Advisor raciocinar sobre dimensões.

-----

## 4. REGRAS EDITORIAIS — INVIOLÁVEIS

### Anti-alucinação

- Todo fato citado DEVE estar presente nos sinais coletados
- O LLM é analista que interpreta evidências — nunca jornalista que cria conteúdo
- Se sinais são insuficientes, diz que a evidência é limitada

### Confidencialidade de fontes

- NUNCA citar nomes: Gartner, McKinsey, Forrester, IDC, etc.
- Sempre por categoria: “global research institutes”, “strategic consulting firms”

### Paridade de scores PT = EN

- `taime_score` e os 5 `score_dimensions` são idênticos entre PT e EN
- Mecanismo duplo: constraints no prompt + override programático

### THEN — Ponto de inflexão estratégico

- Identifica QUANDO o consenso dominante estava claramente errado sobre aquela trend
- Pode ser 6 meses ou 10 anos antes do relatório
- Usa datas absolutas: “Em 2021…”, “Entre 2018 e 2020…”, “Antes de 2008…”
- PROIBIDO: “Há 12 a 18 meses…”, qualquer linguagem relativa
- Gera subtítulo prefixado com `PERIOD_LABEL: Contexto de 2021-2023`

### NEXT — Projeção, não certeza

- “Os sinais apontavam para…”, “A trajetória sugeria…”, “Se os padrões se mantivessem…”
- NUNCA descrever o que realmente aconteceu após o período
- NUNCA usar hindsight

### MOVE — Orientado à ação

- Foco no QUE precisa acontecer, não em QUEM deve fazer
- Relevante para MEI, micro empresa e grande corporação simultaneamente
- PROIBIDO: “Designar um líder sênior com mandato de 90 dias”
- CORRETO: “Mapear o portfólio atual, identificar dependências críticas…”

### Contra-tese (opcional)

- Incluir APENAS quando os sinais suportam uma condição genuína e específica de não-ação
- NUNCA inventar ou forçar — se não há evidência, omitir
- Exemplos válidos: restrições regulatórias, pré-requisitos organizacionais não atendidos
- NÃO implementar “custo da inação” como métrica — risco de alucinação

### Sem valores monetários

- NUNCA sugerir valores em qualquer moeda (R$, USD, EUR)

### Público universal

- NUNCA focar em PMEs ou qualquer porte específico
- Usar: “organizações”, “líderes”, “gestores”, “empresas”

### Temporal Boundary (CRÍTICO)

- Para qualquer período, o LLM usa APENAS informações disponíveis até `period_end_date`
- Instrução no prompt: “You are FORBIDDEN from using information after {PERIOD_END_DATE}”
- Aplica-se a TODOS os campos: TYPE, ACT, IMPACT, MOVE, EXIT, THEN, NOW, NEXT
- Para relatórios históricos lidos no futuro: banner “Registro histórico”

### Sem travessões (EM DASH)

- NUNCA usar — no meio de frases em nenhum campo gerado
- Regra ativa no SYSTEM_PROMPT: “EM DASH PROHIBITION”
- Reforço determinístico: `stripEmDash` remove o em dash (U+2014) antes de persistir, sem tocar em hífens (U+002D) — palavras compostas como "self-guided" ficam intactas
- Substituir por “:” ou “.” ou nova frase

### Revisão humana obrigatória

- Todo relatório passa por revisão antes de `status = 'published'`

### Validação automática + curadoria (IA auditando a IA)

Entre a geração e a publicação há uma camada de validação automática que alimenta a revisão humana, garantindo a regra inviolável de não-alucinação.

- **Validador (LLM-as-judge + checks determinísticos):** após a geração, cada relatório é auditado em quatro frentes — *grounding* (cada afirmação factual é rastreável aos sinais coletados do período?), *boundary temporal* (nada posterior à data-fim do período, sem hindsight), *atribuição de fonte* (o texto pode citar uma empresa como sujeito de um fato, mas não como fonte da informação — "segundo a Gartner" vaza o método e é bloqueado), e *regras determinísticas* (scores PT=EN, ausência de em dash e de sizing financeiro). Cada ocorrência vira um *flag* com severidade.
- **Auto-publish vs. curadoria:** relatório que passa limpo (sem flags) é publicado automaticamente. Qualquer flag o envia para `pending_review`, onde aguarda decisão humana no painel `/admin/reports`. O número de sinais do período acompanha os flags, sinalizando quando a cobertura é rala (caso em que regenerar não ajuda — o problema é coleta).
- **Copiloto corretor:** para cada flag, uma IA propõe uma correção **estritamente subtrativa** (só remove ou suaviza o problema, nunca adiciona fato, número, nome ou data novos), em PT e/ou EN, com a justificativa. O curador humano aceita, edita antes, ou ignora — a IA nunca aplica sozinha.
- **O humano é sempre o gate final.** A publicação nunca é automática para um relatório que falhou na validação, mesmo após correções e revalidação limpa. O validador é assessor, não porteiro: o curador pode publicar mesmo com flags, sob sua responsabilidade.
- **Fidelidade aos sinais, não à verdade absoluta:** a validação garante que o relatório é fiel ao que foi coletado, não que captura toda a realidade do período. Para períodos antigos com coleta limitada, relatórios mais curtos e honestos são o resultado esperado e correto.

-----

## 5. PIPELINE TÉCNICO

### Visão geral do fluxo

```
Serper API (110 fontes) → signals → signal_clusters → reports + report_trends → validação → publicado
         ↑                    ↑              ↑                  ↑
   collect-signals      analyze-signals  generate-report   validate-report
                                                          (auto-publish ou pending_review + flags)
```

### Scripts em `/claude-taime/`

|Script               |Função                                                                        |
|---------------------|------------------------------------------------------------------------------|
|`collect-signals.ts` |Coleta via Serper API — 110 fontes, 16 categorias, queries amplas sem year    |
|`analyze-signals.ts` |Clustering com Claude — 4-12 clusters, minimum 8 signals per cluster          |
|`generate-report.ts` |Geração bilíngue PT+EN — divisão automática em 2 relatórios quando >7 clusters; classifica cada trend em `category` (14 rótulos) + `theme_slug` (chave estável entre ciclos, reusada quando a trend continua um tema)|
|`validate-report.ts` |Validação automática (grounding + temporal + atribuição de fonte + checks determinísticos) com copiloto de correção subtrativa. Auto-publica relatórios limpos; envia flagueados para `pending_review`. Pode rodar inline (após geração) ou standalone por período|
|`collect-radar.ts`   |Notícias das últimas 24h via Claude Haiku                                     |
|`period-utils.ts`    |Utilitário de períodos — labels PT e EN, quinzenais e mensais                 |
|`generate-periods.ts`|CLI: gera batch-periods.json para um intervalo                                |
|`batch-pipeline.ts`  |Orquestrador com retomada — salva progresso em batch-progress.json            |

### Uso típico

```bash
# Relatório único
PERIOD=2026-05-01 npx ts-node collect-signals.ts
PERIOD=2026-05-01 npx ts-node analyze-signals.ts
PERIOD=2026-05-01 npx ts-node generate-report.ts

# Batch histórico
npx ts-node generate-periods.ts 2025-01-01 2025-12-01
npx ts-node batch-pipeline.ts
npx ts-node batch-pipeline.ts --resume  # retomar se interrompido

# Radar
npx ts-node collect-radar.ts
```

### Frequência de relatórios

|Era      |Frequência|Períodos    |
|---------|----------|------------|
|2000–2014|Mensal    |dia 01      |
|2015–hoje|Quinzenal |dias 01 e 16|

### Divisão automática de relatórios

- 4-7 clusters → 1 relatório (report_number = 1)
- 8-12 clusters → 2 relatórios (report_number = 1 e 2)
- Cada relatório tem título e resumo executivo gerados independentemente
- Sem sufixo “Parte N” nos títulos — cada relatório tem identidade própria

### Categorias de trend e theme_slug

Cada trend recebe dois rótulos idioma-neutros (idênticos em PT e EN):

- **`category`** — uma de 14: IA, Cloud, Cybersecurity, Regulation, Infrastructure, Data, Market, Fintech, Automation, Observability, Engineering, Edge, Healthtech, Sustainability. É a "gaveta larga", usada nos chips de filtro do dashboard.
- **`theme_slug`** — chave fina em kebab-case (ex.: `ia-agentes-autonomos`, `governanca-ia`), ESTÁVEL entre ciclos: o gerador reutiliza um slug existente quando a trend continua um tema já coberto, criando slug novo só para tema genuinamente novo. É o que permite rastrear a evolução de um tema ao longo do tempo (base para futura trilha temporal e para deltas de score).

Há um script de back-fill (`backfill-trend-theme.ts`) que preenche `category`/`theme_slug` em trends já existentes sem regenerar relatórios (classifica via LLM em lotes; flags `--dry-run` e `--force`).

-----

## 6. COLETA DE SINAIS — 110 FONTES EM 16 CATEGORIAS

### Queries por categoria (todas em inglês)

|Categoria       |Query                                                                                                                                                                                                                                                                                               |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`research`      |AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR “machine learning” OR “digital transformation” OR “business model” OR “operating model” OR “platform business” OR “business transformation” OR blockchain OR quantum OR semiconductor|
|`consulting`    |Idêntica ao research                                                                                                                                                                                                                                                                                |
|`vc`            |AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR “machine learning” OR “digital transformation” OR blockchain OR quantum OR semiconductor                                                                                             |
|`media`         |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`academic`      |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`think_tank`    |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`vendor`        |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`security`      |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`financial`     |Idêntica ao vc                                                                                                                                                                                                                                                                                      |
|`data`          |data platform OR data governance OR data sovereignty OR “data mesh” OR “data lakehouse” OR privacy OR “data protection” OR GDPR OR LGPD OR “data management” OR analytics OR “data strategy”                                                                                                        |
|`automation`    |“business process” OR “process automation” OR RPA OR “robotic process automation” OR “intelligent automation” OR “process mining” OR “workflow automation” OR “hyperautomation” OR “low-code” OR “no-code”                                                                                          |
|`observability` |“LLM observability” OR “AI monitoring” OR “model drift” OR “LLMOps” OR “ML monitoring” OR “AI explainability” OR “model audit” OR OpenTelemetry OR tracing OR “distributed tracing”                                                                                                                 |
|`engineering`   |“software engineering” OR “developer productivity” OR “AI coding” OR “code generation” OR “developer tools” OR DevOps OR platform OR “internal developer platform” OR “software delivery”                                                                                                           |
|`edge`          |“edge computing” OR “edge AI” OR IoT OR “internet of things” OR “on-device AI” OR “edge inference” OR “industrial IoT” OR “embedded AI”                                                                                                                                                             |
|`healthtech`    |“digital health” OR “health AI” OR “clinical AI” OR “drug discovery” OR “medical imaging” OR “health data” OR EHR OR “precision medicine” OR biotech OR genomics                                                                                                                                    |
|`sustainability`|“green tech” OR “sustainable technology” OR “carbon footprint” OR “energy efficiency” OR “data center energy” OR “AI energy consumption” OR ESG OR “climate tech”                                                                                                                                   |

### Fontes por categoria

**research (15):** Gartner, Forrester, IDC, ISG, CB Insights, 451 Research, Omdia, Canalys, Counterpoint Research, TrendForce, Everest Group, Thoughtworks, CNCF, IBM Research, Linux Foundation

**consulting (8):** McKinsey, BCG, Bain, Deloitte, PwC, KPMG, EY, Accenture

**vc (5):** a16z, Sequoia, Bessemer, First Round, Y Combinator

**media (11):** TechCrunch, Wired, Bloomberg, Reuters, FT, CNBC, The Economist, The Verge, Ars Technica, VentureBeat, InfoQ

**academic (6):** arXiv, Stanford HAI, MIT CSAIL, MIT Tech Review, HBR, Nature Technology

**think_tank (6):** WEF, OECD, Brookings, CSIS, RAND, Oxford Internet Institute

**vendor (19):** AWS, Google Cloud, Azure, Anthropic, OpenAI, NVIDIA, Oracle, SAP, Meta, Apple, Cisco, Intel, Salesforce, ServiceNow, Hugging Face, DeepMind, GitHub, Google Blog, Microsoft News

**security (6):** CrowdStrike, Palo Alto Unit 42, Fortinet, Mandiant, Cisco Talos, CISA

**financial (5):** Goldman Sachs, Morgan Stanley, JPMorgan, BlackRock, Bank of America, PitchBook

**data (5):** Databricks, Snowflake, dbt Labs, IAPP, Informatica

**automation (3):** UiPath, Automation Anywhere, MuleSoft

**observability (5):** Datadog, Grafana, Honeycomb, New Relic, Weights & Biases

**engineering (3):** Stack Overflow, JetBrains, The New Stack

**edge (3):** ARM Blog, Eclipse IoT, Linux Foundation Edge

**healthtech (3):** Rock Health, NEJM Catalyst, Nature Medicine

**sustainability (3):** GreenBiz, IEA Digitalisation, Rocky Mountain Institute

-----

## 7. ARQUITETURA DO BANCO

**Supabase** (PostgreSQL 15+). Project ref: `udcyimlxjjzlozmfvufb`.

### Tabelas principais

|Tabela            |Propósito                                                              |
|------------------|-----------------------------------------------------------------------|
|`sources`         |110 fontes em 16 categorias, com coluna `active boolean`               |
|`signals`         |Artigos coletados por período via Serper                               |
|`signal_clusters` |Grupos temáticos identificados pelo LLM                                |
|`reports`         |Relatórios por período — com `report_number` para múltiplos por período|
|`report_trends`   |4-12 trends por relatório com análise completa PT e EN; inclui `category` (1 de 14 rótulos largos) e `theme_slug` (chave de tema estável entre ciclos)|
|`users`           |Extensão do auth.users do Supabase                                     |
|`subscriptions`   |Plano e status Stripe por cliente                                      |
|`advisory_memory` |Histórico de conversas do Executive Advisor                            |
|`advisor_profiles`|Perfil empresarial do onboarding do Advisor                            |
|`radar_signals`   |Sinais diários do Radar TAIME                                          |
|`reading_progress`|Progresso de leitura por usuário/relatório (scroll_pct, completed, last_read_at). RLS por usuário. Alimenta "continuar lendo" e "recomendados"|
|`saved_reports`   |Relatórios salvos ("ler depois") por usuário. RLS por usuário|
|`waitlist`        |Lista de espera com nome, empresa, cargo, interesse                    |
|`contacts`        |Formulário de contato                                                  |
|`admins`          |Controle de acesso ao painel admin                                     |
|`newsletter_subscribers`|Inscritos no Radar (`status` active/blocked/unsubscribed/removed, `unsubscribe_token`, `blocked_reason`, `status_changed_at`, `status_changed_by`)|
|`newsletter_sends`|Histórico de envios diários da newsletter. Snapshot do conteúdo (subject + body PT e EN), contagens (`recipient_count`, `sent_count`, `failed_count`), `status` (sent/partial/skipped/failed) e `resend_reference` para cruzar no painel do Resend|
|`newsletter_send_recipients`|Lista de destinatários por envio com `delivered` e `error`. FK em `newsletter_sends.id`|

### Constraints críticas de reports

- `reports_pkey` — PRIMARY KEY (id)
- `reports_period_number_key` — UNIQUE (period, report_number)
- Sem UNIQUE isolado em period — permite múltiplos relatórios por período

-----

## 8. STACK TÉCNICA

|Componente   |Tecnologia                                  |Detalhe                                        |
|-------------|--------------------------------------------|-----------------------------------------------|
|Frontend     |Next.js 16.2.4 App Router                   |taime-web/                                     |
|Database     |Supabase PostgreSQL 15+                     |project: udcyimlxjjzlozmfvufb                  |
|LLM principal|Claude Sonnet 4.6                           |pipeline + advisor                             |
|LLM radar    |Claude Haiku 4.5 (claude-haiku-4-5-20251001)|coleta de radar                                |
|Search       |Serper API                                  |Google Search wrapper                          |
|Email        |Resend                                      |[noreply@taime.tech](mailto:noreply@taime.tech)|
|Deploy       |Vercel                                      |repositório: ccanei/taime                      |
|CSS          |Tailwind CSS                                |tema taime-600 (#2563EB)                       |
|Pagamentos   |Stripe                                      |pendente                                       |
|i18n         |Custom                                      |cookie taime-locale, PT/EN                     |
|Autenticação |Supabase Auth                               |magic link via SMTP Resend                     |

### Variáveis de ambiente

```env
# Público (browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=https://www.taime.tech

# Privado (server-side)
SUPABASE_SERVICE_KEY=eyJ...
RESEND_API_KEY=re_...
CRON_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
SERPER_API_KEY=...
ADMIN_NOTIFICATION_EMAIL=notify@taime.tech
```

-----

## 9. PLANOS E PREÇOS

|Plano          |Preço            |O que inclui                                                                                                          |
|---------------|-----------------|----------------------------------------------------------------------------------------------------------------------|
|**Gratuito**   |Grátis           |2 relatórios completos por mês (janela rolling de 30 dias), preview dos demais, Radar de hoje                          |
|**Essencial**  |Acesso Antecipado|Limites atuais do site (completo até 1 ano, preview 1-5 anos) + Executive Advisor com quantidade limitada de mensagens *(fase futura)*|
|**Estratégico**|Acesso Antecipado|Histórico completo desde 2000 + Executive Advisor com volume ampliado de mensagens                                     |

Preços em USD e BRL serão anunciados quando Stripe for integrado.

### Decisão de estrutura de planos - 2026-06-11

- **Três planos** (não quatro): **FREE** (2 relatórios completos/mês), **ESSENTIAL**
  (limites atuais do site + Advisor com quantidade limitada de mensagens, em fase
  futura) e **STRATEGIC** (histórico completo + Advisor com volume ampliado de
  mensagens).
- **Plano "Advisory" separado: eliminado.** O Executive Advisor deixa de ser um
  plano à parte e passa a ser distribuído entre Essential (acesso limitado) e
  Strategic (acesso ampliado).
- **Estado atual:** Advisor liberado **somente para Strategic** (subscription
  ativa), em desenvolvimento/calibração. Essential e Free veem o estado "em breve"
  (sem chat, sem onboarding).
- **Gate técnico:** centralizado em `lib/plan.ts` (`getUserPlan` + `hasAdvisorAccess`).
  `hasAdvisorAccess` hoje retorna `true` apenas para `strategic`; quando os limites
  de mensagens do Essential existirem, o ajuste é nesse único ponto. O gate real é
  server-side em `/api/advisor/chat` (403 para quem não tem acesso) e espelhado na
  UI (`app/dashboard/advisor/page.tsx` e card em `app/dashboard/page.tsx`).
- **Stripe: pendente.** O gate lê a tabela `subscriptions` (status `active`),
  compatível com a futura integração, sem necessidade de mudança no gate quando
  o Stripe entrar.

-----

## 10. EXECUTIVE ADVISOR — VISÃO COMPLETA

### Status atual

- Interface pronta (onboarding 4 etapas + chat)
- **Liberado para Strategic** (subscription ativa), em desenvolvimento/calibração
- Essential/Free veem o estado "em breve" (sem chat, sem onboarding)
- Gate centralizado em `lib/plan.ts`; gate real server-side em `/api/advisor/chat` (403)

### Como funciona (quando ativo)

1. Cliente completa onboarding: empresa, setor, tamanho, infraestrutura, objetivo, maturidade
1. Cada mensagem carrega: perfil + últimas 20 mensagens da sessão + últimos 3 relatórios TAIME
1. Claude Sonnet 4.6 responde como consultor estratégico com framework TAIME
1. Detecta idioma da mensagem e responde no mesmo
1. Histórico salvo em `advisory_memory` por sessão

### Roadmap do Advisor

**Fase 1 (em construção):** Chat contextualizado com relatórios TAIME

**Fase 2:** Plano estratégico personalizado por empresa

**Fase 3:** Acompanhamento semanal automático — novo relatório notifica cliente sobre impacto no plano específico dele

**Fase 4:** Validação de ROI histórico — benchmarks setoriais baseados em padrões do arquivo

-----

## 11. ROADMAP COMPLETO

### Concluído ✅

- Pipeline técnico completo (collect → analyze → generate)
- 110 fontes em 16 categorias com queries amplas
- Divisão automática em 2 relatórios quando >7 clusters
- Contra-tese opcional no framework
- Temporal Boundary ativo em todos os relatórios
- Sem travessões no conteúdo gerado
- MOVE sem sujeito hierárquico
- Batch pipeline histórico com retomada
- Geração bilíngue nativa PT/EN com paridade de scores
- Radar TAIME com cron automático (07h e 14h BRT)
- Frontend completo PT/EN
- Deploy em [www.taime.tech](http://www.taime.tech)
- SMTP Resend ativo ([noreply@taime.tech](mailto:noreply@taime.tech))
- Emails automáticos: waitlist + aprovação
- Admin/waitlist com aprovação de acesso
- Busca com score de relevância progressiva
- Dashboard de leitura: continuar lendo (com retomada de scroll), ler depois (salvos), recomendados (por tema), filtro por categoria (chips)
- `category` + `theme_slug` por trend (14 categorias) + script de back-fill

### Em andamento

- [ ] Regenerar todos os relatórios de 2025 e 2026 com novas regras
- [ ] Gerar 2024 completo (~$10)

### MVP — próximas semanas

- [ ] Stripe integrado
- [ ] Busca semântica nível 3 (embeddings/pgvector) após 20+ relatórios

### Fase 2 — Crescimento (2026 Q3)

- [ ] Executive Advisor ativo
- [ ] Histórico 2022–2024 completo
- [ ] Notificações por email ao publicar novo relatório
- [ ] Plano Advisory

### Fase 3 — Escala (2026 Q4)

- [ ] Histórico 2015–2021 quinzenal
- [ ] Planos corporativos
- [ ] API para integrações externas

### Fase 4 — Histórico completo (2027)

- [ ] Histórico 2000–2014 mensal
- [ ] 25 anos completos disponíveis

-----

## 12. COMO TRABALHAMOS

### Regras de desenvolvimento

- **Autonomia total**: Claude Code executa sem pedir permissão
- **LOG.md atualizado** após cada entrega
- **Build com 0 erros TypeScript** antes de cada commit
- **Prompts sempre começam com**: “IMPORTANTE: Tens autonomia total para criar, editar, mover e deletar arquivos sem pedir permissão. Executa tudo sem pausas para confirmação.”

### Repositório e deploy

- **GitHub**: `ccanei/taime` — contém pasta `taime-web/` na raiz
- **Vercel**: projeto `taime` conectado a `ccanei/taime`
- **Root Directory na Vercel**: `taime-web`
- **Framework**: Next.js (obrigatório — não “Other”)
- **NUNCA usar**: `ccanei/taime-web` (não existe)

### Segurança

- Nunca subir `.env` ou `.env.local` para o GitHub
- `.claude/` no `.gitignore`
- `taime-web-BACKUP-*/` no `.gitignore`
- SUPABASE_SERVICE_KEY foi exposta no commit a82cd003 — já rotacionada

-----

## 13. STATUS ATUAL (2026-05-28)

### Relatórios publicados

- 2 relatórios de 2025-12-16 gerados com novas regras (110 fontes, 16 categorias)
- 2025 e 2026 sendo regenerados do zero com todas as melhorias

### Site no ar

- [www.taime.tech](http://www.taime.tech) funcionando
- SSL ativo
- Cron do Radar funcionando (07h e 14h BRT)
- Emails de waitlist e aprovação funcionando
- MX da Locaweb configurado na Vercel

### Admin

- Email admin: [claudineicanei1@gmail.com](mailto:claudineicanei1@gmail.com)
- Notificações de waitlist: [notify@taime.tech](mailto:notify@taime.tech)
- Tabela `admins` no Supabase controla acesso
- Aprovação manual via /admin/waitlist
- Painéis admin disponíveis (gate `isAdmin(user.email)` em todos):
  - `/admin/waitlist` — fila de pedidos de acesso, aprovação, rejeição e mudança de plano
  - `/admin/reports` — curadoria de relatórios em `pending_review`, com flags do validador
  - `/admin/feedback` — feedback dos usuários, revisão e arquivamento
  - `/admin/newsletter` — inscritos do Radar (filtros, bloquear/reativar/remover) e histórico de envios (snapshot + destinatários por envio)
  - `/admin/engagement` — atividade mensal por usuário e custo do Advisor
- Menu compartilhado em `components/AdminNav.tsx` (fonte única; qualquer página nova em `/admin/*` renderiza este componente em vez de duplicar links)

### Contato

- [contact@taime.tech](mailto:contact@taime.tech)
- LinkedIn: <https://www.linkedin.com/company/taime-tech>
- Site: <https://www.taime.tech>

-----

## 14. DECISÕES FUTURAS — PLANEJADO / NÃO IMPLEMENTADO

> ⚠️ Esta seção registra decisões de arquitetura **ainda não aplicadas ao código**.
> O estado em produção continua sendo o descrito nas seções 5 e 10.
> Nada aqui deve ser tratado como implementado até migrar para a seção correspondente.

### 14.1 — Modelos de IA por etapa (upgrade planejado para Opus 4.8)

Preços de referência (USD/1M tokens, padrão): Haiku 4.5 $1/$5 · Sonnet 4.6 $3/$15 · Opus 4.8 $5/$25. Cache hit = 0,1× input. Batch API = −50%.

|Etapa                            |Modelo atual (produção)|Modelo planejado                              |Justificativa                                                    |
|---------------------------------|-----------------------|----------------------------------------------|-----------------------------------------------------------------|
|Radar (`collect-radar.ts`)       |Haiku 4.5              |Haiku 4.5 (manter)                            |Volume alto, tarefa simples                                      |
|Clustering (`analyze-signals.ts`)|Sonnet 4.6             |Sonnet 4.6 (manter); testar Opus se ruído alto|No run 2026-05-01, 82/158 sinais descartados — avaliar           |
|Geração (`generate-report.ts`)   |Sonnet 4.6             |**Opus 4.8**                                  |Etapa de maior valor e risco (scoring, framework, paridade PT=EN)|
|Advisor — resposta               |Sonnet 4.6             |**Opus 4.8** + `max_tokens` maior             |Raciocínio é o produto                                           |
|Advisor — roteamento             |—                      |**Haiku 4.5** (novo)                          |Detectar idioma + selecionar relatório relevante antes do Opus   |

**Impacto de custo da migração da geração (Sonnet → Opus 4.8):** ~+$0,45–0,60 por relatório → ~+$12–16/ano na cadência quinzenal. Custo irrelevante para a etapa que define a qualidade.

**Pré-requisito:** instrumentar `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) por chamada Claude antes de migrar o batch histórico, para medir custo real em vez de estimar. Validar a invariante PT=EN num teste isolado antes do batch completo.

**Cache:** ordenar prefixo do mais estável ao mais volátil (`system → framework/score → contexto clusters+signals → instrução da trend`); manter o bloco de contexto byte-idêntico entre as chamadas PT e EN do mesmo relatório. Rodar a geração histórica via Batch API (−50%, empilha com cache).

### 14.2 — Executive Advisor: geração de plano estratégico

Caso de uso premium: a partir do perfil (receita, valor, tamanho, headcount, **budget de investimento**, **horizonte temporal**), o Advisor diagnostica, lista as iniciativas de IA, **prioriza** e devolve um plano sequenciado por ano com quick wins.

**Estado atual (produção):** `chat/route.ts` usa Sonnet 4.6, `max_tokens: 1024`, contexto = perfil + últimas 20 mensagens + 3 relatórios. **Insuficiente para o caso de uso de plano.**

**Duas mudanças estruturais planejadas:**

**Ideia 1 — Endpoint dedicado de plano (`/api/advisor/plan`), separado do chat.**

- Opus 4.8, `max_tokens: 8192` (a geração do plano não cabe em 1.024).
- Retorna JSON estruturado: iniciativas, score de prioridade por iniciativa, roadmap por ano, dependências.
- **Persistir o plano em tabela própria `advisor_plans`** — não solto no `advisory_memory`. Nas conversas seguintes, o plano entra como bloco compacto e cacheável, em vez de arrastar a resposta crua de ~5k tokens no histórico.

**Ideia 2 — Priorização herdando o TAIME Score.**

- Pontuar cada iniciativa do cliente nas dimensões já validadas (Market Maturity, Strategic Impact, Execution Complexity, Competitive Lag Risk) + nova dimensão **Budget Fit** (dado o investimento informado).
- Mantém o Advisor coerente com o resto do produto e dá critério defensável a “por que esta iniciativa primeiro”.

**Pré-requisitos de dados:** adicionar `investment_budget` e `planning_horizon` ao onboarding e à tabela `advisor_profiles` (hoje ausentes). Sem eles, não há sequenciamento realista.

**`max_tokens` dinâmico no chat:** geração de plano 4.096–8.192; iterações curtas 1.024–2.048.

**Custo estimado (Opus 4.8, com cache):** ~$2–4/mês por cliente moderado (~40 msgs), ~$5–9/mês por cliente intenso (~120 msgs). Estimativa baseada em premissas de comportamento — **medir mensagens/cliente reais nas primeiras semanas pós-lançamento** e recalibrar.

**Dependência:** restringir Advisor a assinantes pagos quando Stripe estiver ativo (já marcado como TODO em `chat/route.ts`).