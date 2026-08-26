#!/usr/bin/env npx ts-node
/* Testa o detector de tabela (logica identica ao lib) contra os replies reais
 * capturados (/tmp/reply1.md, reply2.md) e um caso negativo. */
import { readFileSync } from 'fs'

const COL_HORIZON = /horizonte|horizon|prazo|timeframe|time frame|per[ií]odo|quando|\bwhen\b|\bfase\b|\bphase\b/
const COL_DECIDE  = /decid|decis|decide|decision/
const COL_ACTION  = /iniciar|a[çc][aã]o|a[çc][õo]es|\bacao\b|\baction\b|\bstart\b|fazer agora|do now|\bto do\b/
const COL_AVOID   = /n[aã]o fazer|ainda n[aã]o|\bn[aã]o\b.*\bainda\b|evit|avoid|not yet|don'?t|do not/
const COL_EXIT    = /crit[eé]rio|sa[ií]da|\bexit\b|done when|definition of done|conclu[ií]|complete when/
function detectRoadmapTable(text: string): boolean {
  for (const line of text.split('\n')) {
    if ((line.match(/\|/g)?.length ?? 0) < 3) continue
    const j = line.toLowerCase()
    if (!COL_HORIZON.test(j)) continue
    let cols = 0
    if (COL_DECIDE.test(j)) cols++
    if (COL_ACTION.test(j)) cols++
    if (COL_AVOID.test(j))  cols++
    if (COL_EXIT.test(j))   cols++
    if (cols >= 2) return true
  }
  return false
}

const r1 = readFileSync('/tmp/reply1.md', 'utf8')
const r2 = readFileSync('/tmp/reply2.md', 'utf8')
const neg1 = 'Aqui estao os criterios: latencia, custo, integracao.\n\n| Ferramenta | Pros | Contras |\n|---|---|---|\n| Datadog | completo | caro |\n| Grafana | aberto | setup |'
const neg2 = 'Para escolher observabilidade, considere cardinalidade, retencao e custo por host. Nao ha fases nem horizontes aqui, e uma resposta tatica.'

console.log('reply1 (tabela: Horizonte|Decidir|Iniciar|Nao fazer ainda|Criterio de saida):', detectRoadmapTable(r1))
console.log('reply2 (tabela: Horizonte|Decidir|Iniciar|Ainda nao|Criterio de saida):     ', detectRoadmapTable(r2))
console.log('neg1  (tabela comparacao de ferramentas, sem horizonte):                     ', detectRoadmapTable(neg1))
console.log('neg2  (resposta tatica em prosa, sem tabela):                                ', detectRoadmapTable(neg2))
