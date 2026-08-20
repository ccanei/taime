'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'
import AssessmentPortrait from '@/components/AssessmentPortrait'
import {
  DOMAINS, questionsByDomain, computeScores, computeDomainScore, TOTAL_QUESTIONS,
  type Answers, type Level, type AnswerOrigin,
} from '@/lib/assessment-model'

// Pagina do assessment (TAREFA 3): as 20 perguntas por dominio, respondiveis de uma
// vez, pre-preenchidas e editaveis com o que ja foi capturado nas conversas. Salvar
// parcial permitido; nada obrigatorio. Origem (conversa vs formulario) indicada.
interface ServerAnswer { level: Level; origin: AnswerOrigin; at: string }

export default function AssessmentView() {
  const { locale } = useLocale()
  const isPt = locale === 'pt'
  const lang: 'pt' | 'en' = isPt ? 'pt' : 'en'

  const [server, setServer]   = useState<Record<string, ServerAnswer>>({})
  const [local, setLocal]     = useState<Record<string, Level>>({})
  const [dirty, setDirty]     = useState<Set<string>>(new Set())
  const [available, setAvail] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [failed, setFailed]   = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/advisor/assessment')
        if (!r.ok) { if (!cancelled) setFailed(true); return }
        const j = await r.json() as { available?: boolean; answers?: Record<string, ServerAnswer> }
        if (cancelled) return
        setAvail(j.available !== false)
        const a = j.answers ?? {}
        setServer(a)
        const loc: Record<string, Level> = {}
        for (const k of Object.keys(a)) loc[k] = a[k].level
        setLocal(loc)
      } catch { if (!cancelled) setFailed(true) } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  function select(qid: string, level: Level) {
    setLocal(prev => ({ ...prev, [qid]: level }))
    setDirty(prev => new Set(prev).add(qid))
    setSaved(false)
  }
  async function save() {
    const updates = [...dirty].map(qid => ({ questionId: qid, level: local[qid] })).filter(u => u.level)
    if (updates.length === 0 || saving) return
    setSaving(true); setFailed(false)
    try {
      const r = await fetch('/api/advisor/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: updates }) })
      if (!r.ok) { setFailed(true); return }
      const j = await r.json() as { answers?: Record<string, ServerAnswer> }
      setServer(j.answers ?? {}); setDirty(new Set()); setSaved(true)
    } catch { setFailed(true) } finally { setSaving(false) }
  }

  // Answers para pontuar = selecao local (a origem so importa para o badge).
  const scoringAnswers: Answers = {}
  for (const [k, v] of Object.entries(local)) scoringAnswers[k] = { level: v, origin: server[k]?.origin ?? 'form', at: '' }
  const domains  = computeScores(scoringAnswers)
  const answered = Object.keys(local).length

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-white border border-zinc-200 animate-pulse" />)}</div>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Retrato + progresso */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">{isPt ? 'Seu retrato de maturidade' : 'Your maturity portrait'}</h2>
            <p className="text-xs text-zinc-500 tabular-nums mt-0.5">{answered} {isPt ? `de ${TOTAL_QUESTIONS} respondidas` : `of ${TOTAL_QUESTIONS} answered`}</p>
          </div>
        </div>
        <AssessmentPortrait domains={domains} isPt={isPt} />
      </section>

      {!available && (
        <p className="text-xs text-amber-700">{isPt
          ? 'O diagnóstico entra no ar assim que a base for provisionada. Você pode revisar as perguntas abaixo.'
          : 'The assessment goes live once the database is provisioned. You can review the questions below.'}</p>
      )}

      {/* Perguntas por dominio */}
      {DOMAINS.map(d => {
        const s = computeDomainScore(d.id, scoringAnswers)
        return (
          <section key={d.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <header className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900">{d.label[lang]}</h3>
              <span className={`text-[11px] font-semibold tabular-nums ${s.scored ? 'text-taime-700' : 'text-zinc-400'}`}>
                {s.scored ? `${s.score}/100` : (isPt ? `incompleto ${s.answered}/4` : `incomplete ${s.answered}/4`)}
              </span>
            </header>
            <div className="divide-y divide-zinc-100">
              {questionsByDomain(d.id).map(q => {
                const sel = local[q.id]
                const fromConversation = server[q.id]?.origin === 'conversation' && !dirty.has(q.id)
                return (
                  <div key={q.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[13px] font-medium text-zinc-800 leading-snug">{q.prompt[lang]}</p>
                      {fromConversation && (
                        <span className="shrink-0 rounded-full bg-taime-50 text-taime-700 ring-1 ring-taime-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          {isPt ? 'da conversa' : 'from chat'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {q.options.map(o => (
                        <button key={o.level} type="button" onClick={() => select(q.id, o.level)}
                          className={`text-left rounded-lg border px-3 py-2 text-xs leading-snug transition-colors
                            ${sel === o.level
                              ? 'border-taime-400 bg-taime-50 text-zinc-900 ring-1 ring-taime-200'
                              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'}`}>
                          <span className="inline-flex items-center gap-2">
                            <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${sel === o.level ? 'border-taime-600 bg-taime-600' : 'border-zinc-300'}`}>
                              {sel === o.level && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            {o[lang]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Barra de salvar (parcial permitido) */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
        <span className="text-xs text-zinc-500">
          {dirty.size > 0
            ? (isPt ? `${dirty.size} ${dirty.size === 1 ? 'alteração não salva' : 'alterações não salvas'}` : `${dirty.size} unsaved ${dirty.size === 1 ? 'change' : 'changes'}`)
            : saved ? (isPt ? 'Tudo salvo.' : 'All saved.') : (isPt ? 'Nada obrigatório: responda no seu ritmo.' : 'Nothing required: answer at your pace.')}
          {failed && <span className="text-amber-700 ml-2">{isPt ? 'Falha ao salvar.' : 'Save failed.'}</span>}
        </span>
        <button onClick={save} disabled={saving || dirty.size === 0}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
          {saving ? (isPt ? 'Salvando...' : 'Saving...') : (isPt ? 'Salvar' : 'Save')}
        </button>
      </div>

      <Link href="/dashboard/advisor" className="text-xs font-medium text-zinc-500 hover:text-taime-700 self-start">
        {isPt ? '← Voltar ao Advisor' : '← Back to the Advisor'}
      </Link>
    </div>
  )
}
