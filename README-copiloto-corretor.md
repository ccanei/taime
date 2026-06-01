# Copiloto Corretor — sugestão de correção subtrativa

Para cada flag, a IA propõe uma correção (PT e/ou EN), explica o porquê, e você
aceita com um clique, edita antes, ou ignora. A IA **nunca** aplica sozinha — você é
o gate. Correção é **estritamente subtrativa**: só remove/suaviza o problema, nunca
adiciona fato, número, nome ou data novos.

## Arquivos alterados

```
claude-taime/
└── validate-report.ts          ← copiloto integrado (CORRECTOR_SYSTEM, suggestCorrection,
                                   readFieldBothLangs, isCorrectable + passada de sugestão)

claude-taime/taime-web/
├── app/admin/reports/ReportsAdmin.tsx        ← ValidationFlag ganhou suggestion_pt/en/reason
└── app/admin/reports/[id]/ReviewPanel.tsx    ← UI da sugestão (Aceitar / Editar antes / Corrigir manual)
```

Sem SQL novo — `validation_flags` é JSONB, os campos de sugestão entram livremente.

## Como funciona

1. Durante `validate-report.ts`, após cada flag corrigível ser gerado, o copiloto
   recebe: o trecho flagueado, o motivo, os sinais do cluster, o texto atual PT+EN,
   e o PERIOD_END_DATE. Devolve `suggestion_pt`, `suggestion_en`, `suggestion_reason`.
2. As sugestões ficam gravadas dentro de cada flag (`validation_flags`).
3. Na tela de revisão, cada flag mostra a sugestão (✨), o porquê, e os botões:
   - **Aceitar sugestão** → grava direto (passa pela API de edição: strip de em dash + stale).
   - **Editar antes** → abre os textareas pré-preenchidos com a sugestão, você ajusta e salva.
   - **Corrigir manualmente** → textareas com o texto original, você escreve do zero.
4. Se o copiloto não achou correção subtrativa honesta, mostra
   "IA não propôs correção automática: <razão>" e você corrige manual.

## Salvaguardas (no CORRECTOR_SYSTEM)

1. **Subtrativo only** — só remove/suaviza; proibido adicionar fato/número/nome/data.
2. **Sem nova fonte** — corrige atribuição removendo o nome, nunca trocando por outra.
3. **Boundary temporal** — sugestão nunca referencia nada após PERIOD_END_DATE.
4. **Preserva o insight** — mantém a direção estratégica.
5. **Sem em dash** (e há limpeza determinística extra na saída, por garantia).
6. **Null honesto** — admite quando não dá para corrigir só subtraindo.
7. **Escopo de idioma** — corrige só o idioma flagueado; PT e EN podem variar
   naturalmente, só alinha se o flag for sobre divergência factual entre eles.

## Custo

+1 chamada LLM por flag corrigível, durante a validação. Um relatório com 10 flags
corrigíveis = +10 chamadas. Para o histórico de 25 anos isso soma, mas é o que torna a
curadoria viável (você revisa por clique, não relendo fontes). Flags não-corrigíveis
(erros de parse, nível de relatório) são pulados — não gastam.

## Fluxo completo do período problemático

```
generate-report.ts  → status 'generating'
validate-report.ts  → flags + sugestões geradas → pending_review (se houver flag)
/admin/reports/[id]  → você aceita/edita/ignora cada sugestão
  (cada aceite grava + marca 'stale')
validate-report.ts  → roda de novo para reconfirmar que limpou
  → pass → publica (ou pending_review se ainda há algo)
```

A publicação **nunca** é automática para relatório que falhou de primeira — sempre
passa pelo seu OK final, mesmo após as correções.

## Limitações

- Sugestões só para flags que apontam campo de trend real. Erros de parse do juiz
  (`(judge)`) e flags de nível de relatório não recebem sugestão.
- A sugestão é fiel **aos sinais coletados**, não à realidade histórica absoluta.
  Para períodos com coleta rala, o copiloto valida o que há; relatórios mais curtos e
  honestos são o resultado esperado e correto.
- Confira a sugestão antes de aceitar. O gate é você — a IA propõe, você decide.
