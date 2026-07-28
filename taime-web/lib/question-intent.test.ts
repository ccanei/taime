// Testes do classificador unico de intencao (v5.1). Roda com Node 24:
//   node lib/question-intent.test.ts
import assert from 'node:assert'
import { isTrajectoryQuestion, isProspectiveQuestion, isStrategicQuestion } from './question-intent.ts'

let pass = 0
const fails: string[] = []
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log('OK  ' + name) }
  catch (e) { fails.push('XX  ' + name + '\n      ' + (e instanceof Error ? e.message : String(e))) }
}

// ── A frase EXATA da evidencia (2026-07-28) ──────────────────────────────────
const EVIDENCE = 'com base no framework THEN NOW NEXT, qual seria o NEXT que eu deveria seguir e onde focar meu investimento?'
check('evidencia: classificada como PROSPECTIVA e ESTRATEGICA', () => {
  assert.strictEqual(isProspectiveQuestion(EVIDENCE), true, 'deve ser prospectiva')
  assert.strictEqual(isStrategicQuestion(EVIDENCE), true, 'deve ser estrategica (gate da recencia)')
})
check('evidencia: NAO e trajetoria historica pura (mas e estrategica via prospectiva)', () => {
  // nao precisa ser trajetoria; o gate estrategico ja garante a reserva de recencia
  assert.strictEqual(isStrategicQuestion(EVIDENCE), true)
})

// ── Prospectivas diversas (PT + EN) ──────────────────────────────────────────
for (const q of [
  'qual o proximo passo?',
  'onde devo investir no proximo ano?',
  'o que priorizar agora?',
  'qual seu veredito sobre onde focar?',
  'what is the next move here?',
  'where should i invest?',
  'what should i prioritize?',
  'me da o then now next disso',
  'para onde caminha essa tecnologia?',
]) {
  check(`prospectiva: "${q}"`, () => {
    assert.strictEqual(isProspectiveQuestion(q), true)
    assert.strictEqual(isStrategicQuestion(q), true)
  })
}

// ── Trajetoria (historica) segue sendo estrategica ───────────────────────────
for (const q of [
  'como cybersecurity evoluiu desde 2016?',
  'qual o historico de evolucao de cloud?',
  'how did this evolve over time?',
]) {
  check(`trajetoria: "${q}"`, () => {
    assert.strictEqual(isTrajectoryQuestion(q), true)
    assert.strictEqual(isStrategicQuestion(q), true)
  })
}

// ── Factuais/tacticas NAO sao estrategicas (nao ativam recencia/teto pesado) ──
for (const q of [
  'o que e computacao em nuvem?',
  'quanto custa o plano essential?',
  'qual a definicao de zero trust?',
  'me explica o que e um SIEM',
]) {
  check(`factual (nao estrategica): "${q}"`, () => {
    assert.strictEqual(isStrategicQuestion(q), false, 'nao deve ativar selecao estrategica')
  })
}

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { console.error('\n' + fails.join('\n')); process.exit(1) }
console.log('ALL PASS')
