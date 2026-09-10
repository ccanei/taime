// Testes de deteccao/extracao de conteudo exportavel (ROI + checklist). Sem framework:
// roda com Node 24 (strip de tipos). Do diretorio taime-web:
//   node lib/advisor-export-detect.test.ts
// Sai != 0 se qualquer caso falhar.
import assert from 'node:assert'
import { detectRoi, detectChecklist, extractRoi, extractChecklist } from './advisor-export-detect.ts'

let pass = 0
const fails: string[] = []
function check(note: string, fn: () => void) {
  try { fn(); pass++; console.log(`OK  ${note}`) }
  catch (e) { fails.push(`XX  ${note}\n      ${(e as Error).message}`) }
}

// ── ROI: resposta de calculo financeiro tipica do Advisor ────────────────────
const ROI_MD = `Com os seus numeros: 20h/semana x R$80/h x 4 semanas = R$6.400 por mes de esforco manual, cerca de R$76.800 por ano.

Dois cenarios para raciocinar, nao uma previsao:
- Conservador (captura de 40%): R$2.560 por mes.
- Otimista (captura de 70%): R$4.480 por mes.

Rode o piloto por 60 dias. Se a captura medida ficar abaixo de 30%, o EXIT dispara e o investimento para.`

check('ROI detectado no calculo financeiro', () => assert.strictEqual(detectRoi(ROI_MD), true))
check('ROI extrai custo-hora 80', () => assert.strictEqual(extractRoi(ROI_MD).inputs.costPerHour, 80))
check('ROI extrai horas/mes 80 (20/semana x4)', () => assert.strictEqual(extractRoi(ROI_MD).inputs.hoursPerMonth, 80))
check('ROI base mensal 6400', () => assert.strictEqual(extractRoi(ROI_MD).baseMonthly, 6400))
check('ROI 2 cenarios com pct', () => {
  const s = extractRoi(ROI_MD).scenarios
  const cons = s.find(x => x.label === 'conservador')
  const oti  = s.find(x => x.label === 'otimista')
  assert.ok(cons && Math.abs((cons.pct ?? 0) - 0.4) < 1e-9, 'conservador 40%')
  assert.ok(oti && Math.abs((oti.pct ?? 0) - 0.7) < 1e-9, 'otimista 70%')
})
check('ROI EXIT extraido', () => assert.ok((extractRoi(ROI_MD).exit ?? '').toLowerCase().includes('exit')))

// ── Falsos positivos de ROI ──────────────────────────────────────────────────
check('numero isolado NAO e ROI', () => assert.strictEqual(detectRoi('O custo foi de R$100 no total.'), false))
check('texto sem cenarios NAO e ROI', () => assert.strictEqual(detectRoi('Investir em IA custa R$100 e R$200, retorno incerto.'), false))

// ── Checklist: lista com 5+ itens ─────────────────────────────────────────────
const CHK_MD = `Aqui esta o checklist de governanca:

- Mapear os fluxos criticos
- Definir o dono de cada dado
- Instrumentar observabilidade
- Revisar acessos privilegiados
- Documentar o plano de resposta`

check('checklist 5 itens detectado', () => assert.strictEqual(detectChecklist(CHK_MD), true))
check('checklist extrai 5 itens', () => assert.strictEqual(extractChecklist(CHK_MD).items.length, 5))

// ── Checklist via tabela com coluna de acao ───────────────────────────────────
const CHK_TABLE = `| Ação | Prazo |
| --- | --- |
| Auditar identidades | curto |
| Segmentar a rede | curto |
| Ativar MFA em tudo | medio |
| Cifrar dados em repouso | medio |
| Revisar contratos de nuvem | longo |`
check('checklist via tabela de acao', () => assert.strictEqual(detectChecklist(CHK_TABLE), true))

// ── Falso positivo de checklist: lista curta ─────────────────────────────────
check('lista de 3 itens NAO e checklist', () => assert.strictEqual(detectChecklist('- a\n- b\n- c'), false))

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { console.error('\nFAILURES:\n' + fails.join('\n')); process.exit(1) }
console.log('ALL PASS')
