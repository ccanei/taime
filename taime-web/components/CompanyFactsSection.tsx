'use client'

import { useEffect, useState } from 'react'
import { Cpu, Server, Rocket, Target, ShieldAlert, CheckCircle2, Wallet, Info, Plus, X } from 'lucide-react'
import {
  FACT_CATEGORIES, FACT_CATEGORY_LABELS, MAX_FACT_LENGTH,
  type CompanyFact, type FactCategory,
} from '@/lib/company-facts'

// Secao "Fatos da empresa" (memoria livre). Auto-suficiente: busca em /api/advisor/facts,
// desativa/reativa (toggle is_active) e adiciona fatos manuais (source 'manual').
// variant 'panel': compacta; NAO aparece quando nao ha fatos (sem placeholder vazio).
// variant 'full': pagina de perfil; sempre visivel, com formulario de adicao aberto.

const ICONS: Record<FactCategory, typeof Cpu> = {
  technology: Cpu,
  system:     Server,
  project:    Rocket,
  priority:   Target,
  constraint: ShieldAlert,
  decision:   CheckCircle2,
  budget:     Wallet,
  other:      Info,
}

export default function CompanyFactsSection({
  isPt, variant,
}: {
  isPt: boolean
  variant: 'panel' | 'full'
}) {
  const [facts, setFacts]   = useState<CompanyFact[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(variant === 'full')
  const [cat, setCat]       = useState<FactCategory>('technology')
  const [text, setText]     = useState('')
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/advisor/facts')
      .then(r => (r.ok ? r.json() : { facts: [] }))
      .then((d: { facts?: CompanyFact[] }) => { if (alive) { setFacts(d.facts ?? []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  async function toggle(f: CompanyFact) {
    const next = !f.is_active
    setFacts(prev => prev.map(x => (x.id === f.id ? { ...x, is_active: next } : x)))
    try {
      const r = await fetch('/api/advisor/facts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, is_active: next }),
      })
      if (!r.ok) throw new Error('patch failed')
    } catch {
      setFacts(prev => prev.map(x => (x.id === f.id ? { ...x, is_active: f.is_active } : x))) // rollback
    }
  }

  async function add() {
    const fact = text.trim()
    if (fact.length < 2 || busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/advisor/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, fact }),
      })
      if (r.ok) {
        const d = await r.json() as { fact: CompanyFact }
        setFacts(prev => [...prev, d.fact])
        setText('')
        if (variant === 'panel') setAdding(false)
      }
    } catch { /* silencioso: o cliente pode tentar de novo */ }
    finally { setBusy(false) }
  }

  // Painel: nao renderiza nada enquanto carrega nem quando nao ha fatos.
  if (variant === 'panel' && (!loaded || facts.length === 0)) return null

  const byCat = FACT_CATEGORIES
    .map(c => ({ cat: c, items: facts.filter(f => f.category === c) }))
    .filter(g => g.items.length > 0)

  const title = isPt ? 'Fatos da empresa' : 'Company facts'
  const wrapCls = variant === 'panel'
    ? 'rounded-xl border border-zinc-200 bg-white p-4 shadow-sm'
    : 'rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm'

  const addForm = (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={cat}
          onChange={e => setCat(e.target.value as FactCategory)}
          aria-label={isPt ? 'Categoria' : 'Category'}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-taime-200"
        >
          {FACT_CATEGORIES.map(c => (
            <option key={c} value={c}>{isPt ? FACT_CATEGORY_LABELS[c].pt : FACT_CATEGORY_LABELS[c].en}</option>
          ))}
        </select>
        <input
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_FACT_LENGTH))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          placeholder={isPt ? 'Ex: usamos n8n para automação' : 'e.g. we use n8n for automation'}
          className="flex-1 min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-taime-200"
        />
        <button
          onClick={() => void add()}
          disabled={busy || text.trim().length < 2}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-taime-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-taime-700 disabled:opacity-40 transition-colors"
        >
          <Plus size={13} /> {isPt ? 'Adicionar' : 'Add'}
        </button>
      </div>
    </div>
  )

  return (
    <section className={wrapCls}>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-600">{title}</h3>
        {variant === 'panel' && (
          <button
            onClick={() => setAdding(v => !v)}
            aria-label={adding ? (isPt ? 'Fechar' : 'Close') : (isPt ? 'Adicionar fato' : 'Add fact')}
            className="text-zinc-400 hover:text-taime-600 transition-colors"
          >
            {adding ? <X size={15} /> : <Plus size={15} />}
          </button>
        )}
      </div>

      {byCat.length > 0 ? (
        <div className="flex flex-col gap-3">
          {byCat.map(({ cat: c, items }) => {
            const Icon = ICONS[c]
            return (
              <div key={c}>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                  <Icon size={12} className="text-zinc-400" />
                  {isPt ? FACT_CATEGORY_LABELS[c].pt : FACT_CATEGORY_LABELS[c].en}
                </p>
                <ul className="flex flex-col gap-1">
                  {items.map(f => (
                    <li key={f.id} className="group flex items-start gap-2">
                      <span className={`flex-1 text-[13px] leading-snug ${f.is_active ? 'text-zinc-800' : 'text-zinc-400 line-through'}`}>
                        {f.fact}
                        {f.source === 'manual' && (
                          <span className="ml-1.5 align-middle rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-taime-50 text-taime-600">
                            {isPt ? 'manual' : 'manual'}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => void toggle(f)}
                        aria-label={f.is_active ? (isPt ? 'Desativar fato' : 'Deactivate fact') : (isPt ? 'Reativar fato' : 'Reactivate fact')}
                        title={f.is_active ? (isPt ? 'Desativar' : 'Deactivate') : (isPt ? 'Reativar' : 'Reactivate')}
                        className="shrink-0 mt-0.5 text-zinc-300 hover:text-zinc-600 transition-colors"
                      >
                        {f.is_active
                          ? <X size={13} />
                          : <span className="text-[10px] font-semibold text-taime-600">{isPt ? 'reativar' : 'restore'}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
        variant === 'full' && (
          <p className="text-[13px] text-zinc-500 leading-relaxed">
            {isPt
              ? 'Ainda não há fatos registrados. Eles são capturados automaticamente das suas conversas com o Advisor, e você pode adicionar manualmente abaixo.'
              : 'No facts recorded yet. They are captured automatically from your conversations with the Advisor, and you can add them manually below.'}
          </p>
        )
      )}

      {(adding || variant === 'full') && addForm}
    </section>
  )
}
