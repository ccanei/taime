# Ancoras temporais do Assessment (insumo curavel da Parte B)

Gerado por `collect-assessment-anchors.ts` (na raiz). O script COLETA propostas; a
DECISAO e sua. A Parte B (veredito de atraso) le `assessment-anchors.json`.

## O que e cada ancora
Para cada estagio (niveis 2, 3, 4 de cada pergunta; o nivel 1 e sempre o atrasado, sem
ancora), o `ano` em que aquele estagio deixou de ser diferencial e virou linha de base
no mercado, com o `trecho` (evidencia) da trend que sustenta a data.

## Estrutura (assessment-anchors.json)
```
{
  "_meta": { ... instrucoes ... },
  "data_1": {
    "2": { "ano": 2019, "trend_id": "...", "trend_period": "2019-06-01",
           "evidencia": "trecho literal...", "confianca": "alta",
           "curated": false, "nota": "" },
    "3": { ... }, "4": { ... }
  },
  ...
}
```

## Como curar uma ancora (o que voce faz)
1. Abra `assessment-anchors.csv` para revisar confortavelmente (ou o JSON direto).
2. Ajuste `ano`, `evidencia`, `trend_id`/`trend_period` conforme seu julgamento.
3. Escreva a sua `nota` (opcional).
4. Marque `"curated": true` na ancora revisada.

## Protecao do que voce curou
O script **nunca** sobrescreve uma ancora com `"curated": true` (a menos que voce rode
`--force`). Ao rerodar, ele mescla: preserva o curado e atualiza o resto.

## Flags uteis
- `--domain data` roda so um dominio.
- `--dry-run` imprime sem escrever.
- `--only-missing` reprocessa so as ancoras vazias/sem_lastro (nao curadas).
- `--limit N` limita o numero de ancoras processadas.
- `--force` reprocessa ate as curadas (use com cuidado).

## Confianca
- `alta`: trecho explicito de virada. `media`: indicio menos explicito.
- `sem_lastro`: sem trecho que sustente (ano vazio). Nesta fase, nao estimar e preferivel
  a estimar; `sem_lastro` e a resposta correta quando o arquivo nao mostra a virada.
