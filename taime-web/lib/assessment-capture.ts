import { logLlmCall, usageTokens } from '@/lib/llm-telemetry'
import {
  type AssessmentQuestion, type Level, type Locale, type Answers,
  domainById, DOMAINS, questionsByDomain, computeDomainScore,
} from '@/lib/assessment-model'

// Bloco de contexto factual do estagio do cliente para o Advisor (TAREFA 5). Entra no
// system como o perfil ja entra. PROIBIDO nesta fase (Parte A): veredito de atraso ou
// comparacao com o mercado (isso e a Parte B). O estagio e contexto factual neutro; a
// regra 4b continua valendo (nao presumir fatos nao informados aqui ou no perfil).
export function buildAssessmentContextBlock(answers: Answers, lang: Locale): string {
  const lines: string[] = []
  for (const d of DOMAINS) {
    const qs = questionsByDomain(d.id)
    const answered = qs.filter(q => answers[q.id])
    if (answered.length === 0) continue
    const s = computeDomainScore(d.id, answers)
    const head = s.scored
      ? `${d.label[lang]}: ${s.score}/100`
      : (lang === 'pt' ? `${d.label[lang]}: incompleto (${s.answered} de 4)` : `${d.label[lang]}: incomplete (${s.answered} of 4)`)
    const stages = answered.map(q => `"${q.options.find(o => o.level === answers[q.id].level)?.[lang] ?? ''}"`).join('; ')
    lines.push(`- ${head}. ${lang === 'pt' ? 'Estagios relatados' : 'Reported stages'}: ${stages}`)
  }
  if (lines.length === 0) return ''
  const header = lang === 'pt'
    ? `AUTOAVALIACAO DE MATURIDADE DO CLIENTE (estagios que o PROPRIO cliente relatou, em turnos anteriores ou num formulario; trate como CONTEXTO FACTUAL do cliente, exatamente como o perfil):`
    : `CLIENT MATURITY SELF-ASSESSMENT (stages the client THEMSELVES reported, in prior turns or a form; treat as FACTUAL client context, exactly like the profile):`
  const footer = lang === 'pt'
    ? `USO: calibre a profundidade e as recomendacoes a estes estagios, como voce ja faz com o perfil. PROIBIDO nesta fase: qualquer veredito de que o cliente esta "atrasado", ou comparacao com o mercado ou com o ano em que a tecnologia virou linha de base (isso e uma camada curada separada, indisponivel agora). O estagio e contexto factual neutro. A regra 4b continua sem excecao: nunca presuma um fato que o cliente nao tenha relatado aqui ou no perfil.`
    : `USE: calibrate depth and recommendations to these stages, as you already do with the profile. FORBIDDEN in this phase: any verdict that the client is "behind", or any comparison to the market or to the year a technology became baseline (that is a separate curated layer, not available now). The stage is neutral factual context. Rule 4b still holds without exception: never presume a fact the client has not reported here or in the profile.`
  return `${header}\n${lines.join('\n')}\n${footer}`
}

// Captura incremental do Assessment (Parte A, TAREFA 2). Duas pecas:
//  - buildAskInstruction: bloco OPCIONAL para o system prompt, para o Advisor tecer UMA
//    pergunta de assessment na anamnese natural (nunca como formulario). Em duvida, nao pergunta.
//  - mapAnswerToLevel: mapeia a resposta em linguagem natural do cliente ao nivel (1-4)
//    via Haiku, FORA do caminho critico, fail-safe. Sem confianca -> null (nao grava, nao insiste).

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MAP_MODEL = 'claude-haiku-4-5'

// Instrucao de anamnese (vai no system, marcada como opcional e nao burocratica).
export function buildAskInstruction(question: AssessmentQuestion, lang: Locale): string {
  const domain = domainById(question.domain)
  const domainLabel = domain ? domain.label[lang] : question.domain
  const prompt = question.prompt[lang]
  if (lang === 'pt') {
    return `ANAMNESE DE DIAGNOSTICO (opcional, use SO se couber): voce ainda nao conhece o estagio do cliente em "${domainLabel}". Se, e SOMENTE se, encaixar com naturalidade no fechamento da sua resposta, teca UMA pergunta curta, na sua voz, equivalente a: "${prompt}". NUNCA leia as opcoes de multipla escolha, NUNCA transforme isto num formulario ou lista, NUNCA faca mais de uma pergunta de diagnostico por resposta. Se nao couber no fluxo, ignore por completo (em duvida, nao pergunta).`
  }
  return `DIAGNOSTIC ANAMNESIS (optional, use ONLY if it fits): you do not yet know the client's stage on "${domainLabel}". If, and ONLY if, it fits naturally into the close of your reply, weave in ONE short question, in your own voice, equivalent to: "${prompt}". NEVER read out multiple-choice options, NEVER turn this into a form or a list, NEVER ask more than one diagnostic question per reply. If it does not fit the flow, skip it entirely (when in doubt, do not ask).`
}

// Mapeia a resposta do cliente ao nivel de UMA pergunta. Fail-safe: null se nao houver
// resposta clara ou confianca. Nao insiste, nao grava sem confianca.
export async function mapAnswerToLevel(
  question: AssessmentQuestion,
  clientText: string,
  lang: Locale,
  opts: { userId: string },
): Promise<{ level: Level; reason: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !clientText.trim()) return null
  const stages = question.options.map(o => `${o.level}: ${o[lang]}`).join('\n')
  const sys = `You map a client's free-text message to ONE of four maturity stages for a single diagnostic question. Output ONLY strict JSON: {"confident": true|false, "level": 1|2|3|4, "reason": "<=12 words"}. Rules:
- Return "confident": false (and omit level) if the client's message does NOT actually answer THIS question, is off topic, or you are not sure. Better to skip than to guess.
- Never invent a stage the client did not describe. Map only what the message actually states about their situation.
- Output the JSON and nothing else.

QUESTION: ${question.prompt[lang]}
STAGES:
${stages}`
  const t0 = Date.now()
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MAP_MODEL, max_tokens: 120, system: sys, messages: [{ role: 'user', content: `CLIENT MESSAGE:\n${clientText}` }] }),
    })
    const data = await res.json() as { content?: Array<{ type: string; text: string }>; usage?: Record<string, number> }
    logLlmCall({ caller: 'advisor', model: MAP_MODEL, ...usageTokens(data?.usage ?? null), latency_ms: Date.now() - t0, success: res.ok, error_code: res.ok ? null : 'api_error', user_id: opts.userId, meta: { step: 'assessment_map', question_id: question.id } })
    if (!res.ok) return null
    const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').trim()
    const jsonStr = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let parsed: { confident?: boolean; level?: number; reason?: string }
    try { parsed = JSON.parse(jsonStr) } catch { return null }
    if (!parsed.confident) return null
    const level = parsed.level
    if (level !== 1 && level !== 2 && level !== 3 && level !== 4) return null
    return { level: level as Level, reason: (parsed.reason ?? '').slice(0, 80) }
  } catch (e) {
    console.error('[assessment-capture] map falhou (ignorado):', e instanceof Error ? e.message : e)
    return null
  }
}
