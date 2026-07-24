# TAIME, Guia de Geracao de Lotes

Referencia pratica do pipeline de geracao de relatorios por periodo. Roda na RAIZ
do `taime-CLEAN` (nao em `taime-web`). Geracao sempre com `NO_AUTO_PUBLISH=1`;
publicacao e manual pelo admin apos revisao humana.

## Pipeline padrao (5 etapas)

Para um periodo (ex.: `2026-07-01`):

```bash
# 1. Coleta Serper (fontes ativas, janela de data do periodo)
PERIOD=2026-07-01 npx ts-node collect-signals.ts

# 2. Filtro de ruido (Haiku marca is_noise por padroes estruturais)
PERIOD=2026-07-01 npx ts-node filter-signals.ts

# 3. Clustering (Sonnet agrupa is_noise=false em clusters tematicos)
PERIOD=2026-07-01 npx ts-node analyze-signals.ts

# 4. Geracao do relatorio (Opus historico, Sonnet periodo presente)
NO_AUTO_PUBLISH=1 PERIOD=2026-07-01 npx ts-node generate-report.ts

# 5. Validacao (LLM-judge + checks deterministicos)
PERIOD=2026-07-01 npx ts-node validate-report.ts
```

O `batch-pipeline.ts` orquestra varios periodos de uma vez (ver batch-periods.json).

## Passo OPCIONAL de enriquecimento: ponte Radar to Signals

O `promote-radar-signals.ts` promove sinais do **Radar** (`radar_signals`) para a
tabela `signals`, como ENRIQUECIMENTO ADICIONAL a coleta normal, nunca como
substituta. E util quando o Radar capturou URLs relevantes que a coleta top-down
do `collect-signals` (guiada por `TOPIC_BY_CATEGORY`) nao trouxe.

### Grounding (inviolavel)

A ponte usa o Radar apenas como **lista de URLs candidatas** e busca o CONTEUDO
ORIGINAL de cada URL (fetch do artigo). O resumo ja gerado por LLM no Radar
(`summary_pt` / `summary_en`) NUNCA vira base factual: serviu so para a triagem de
relevancia. O `title_pt` / `title_en` do Radar so pode ser rotulo de fallback,
nunca fato. Sinais sem fonte curada correspondente (dominio fora de `sources`) ou
com fetch falho sao PULADOS, nunca inventados.

### Onde encaixa

Rode a ponte DEPOIS do `collect-signals` e ANTES do `filter-signals`. Ela so
enriquece o pool de `signals` do periodo; o filtro Haiku e o analyze rodam depois
normalmente (a ponte grava `is_noise: false`; o Haiku pode remarcar).

```bash
# 1. Coleta normal
PERIOD=2026-07-01 npx ts-node collect-signals.ts

# 1b. (OPCIONAL) Enriquecimento pelo Radar.
#     Primeiro em modo de teste, para ver o rendimento sem gravar:
npx ts-node promote-radar-signals.ts 2026-07-01 --dry-run
#     Depois, para gravar de fato:
npx ts-node promote-radar-signals.ts 2026-07-01

# 2..5. Segue o pipeline padrao a partir do filter
PERIOD=2026-07-01 npx ts-node filter-signals.ts
PERIOD=2026-07-01 npx ts-node analyze-signals.ts
NO_AUTO_PUBLISH=1 PERIOD=2026-07-01 npx ts-node generate-report.ts
PERIOD=2026-07-01 npx ts-node validate-report.ts
```

### O que a ponte faz (resumo)

1. Seleciona candidatos do Radar cuja data efetiva (`published_at` quando presente,
   senao `collected_at`) cai na janela quinzenal do periodo (via `period-utils`).
   Ordena por `relevance` (high > medium > low).
2. Deduplica por URL contra `signals` ja existentes no mesmo periodo (idempotente).
3. Resolve `source_id` pelo dominio da URL contra `sources`. Sem match, pula
   (`skipped_no_source`). Nao inventa fonte nem usa fallback generico.
4. Busca o conteudo ORIGINAL da URL. Falha/timeout/paywall/vazio, pula
   (`skipped_fetch_failed`). Nunca usa o summary do Radar como content.
5. Insere os sobreviventes em `signals` com `metadata.origin = 'radar_bridge'`
   para rastreabilidade.

### Relatorio de execucao

No fim imprime: candidatos no periodo, pulados por dedup, pulados sem fonte curada,
pulados por fetch falho, e inseridos. Isso mostra o rendimento real da ponte. Como
o Radar cobre um universo de dominios muito mais amplo que as fontes curadas, e
esperado que a maioria dos candidatos seja pulada por `skipped_no_source`: o que
entra e pouco, mas curado e grounded.

### Idempotencia

Rodar duas vezes nao duplica: a dedup por URL contra o periodo cobre isso.
