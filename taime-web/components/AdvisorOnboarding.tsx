'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'
import { tidyProfileText } from '@/lib/strip-markdown'

const INFRA_MARKER = 'Tecnologias em uso:'

// Valores CANONICOS gravados no banco (nunca mudam com o idioma). O rotulo exibido
// e traduzido via i18n (t.advisorOnboarding.*), mapeado por estes valores.
const SECTORS = ['Tecnologia', 'Financeiro', 'Saúde', 'Varejo', 'Indústria', 'Serviços', 'Educação', 'Outro']
const SIZES = ['1-10 funcionários', '11-50 funcionários', '51-200 funcionários', '201-1000 funcionários', '1000+ funcionários']
const INFRA_OPTIONS = ['On-premise', 'Cloud pública', 'Cloud híbrida', 'SaaS', 'Legacy systems', 'IA em uso']
const MATURITY_VALUES = ['inicial', 'intermediário', 'avançado'] as const

interface Props {
  userId: string
  onComplete: () => void
}

export default function AdvisorOnboarding({ userId, onComplete }: Props) {
  const { t } = useLocale()
  const L = t.advisorOnboarding

  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)   // carrega o perfil atual ao abrir
  const [error, setError]     = useState('')

  // Step 1
  const [companyName, setCompanyName] = useState('')
  const [sector, setSector]           = useState('')
  const [companySize, setCompanySize] = useState('')

  // Step 2
  const [infraText, setInfraText]     = useState('')
  const [infraChecks, setInfraChecks] = useState<string[]>([])

  // Step 3
  const [objective, setObjective] = useState('')

  // Step 4
  const [maturity, setMaturity] = useState('')

  // Ao ABRIR: carrega o perfil ja salvo e pre-preenche os campos (o formulario e
  // EDICAO, nao cadastro do zero). RLS permite o usuario ler o proprio perfil.
  // Fail-safe: se a busca falhar, o form abre com o que tiver.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createSupabaseBrowser()
        const { data } = await supabase
          .from('advisor_profiles')
          .select('company_name, sector, company_size, current_infrastructure, strategic_objective, maturity_level')
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled || !data) return
        if (data.company_name)        setCompanyName(data.company_name)
        if (data.sector)              setSector(data.sector)
        if (data.company_size)        setCompanySize(data.company_size)
        if (data.maturity_level)      setMaturity(data.maturity_level)
        if (data.strategic_objective) setObjective(tidyProfileText(data.strategic_objective))
        if (data.current_infrastructure) {
          // Desmonta o campo combinado de volta em texto livre + chips marcados.
          const infra = data.current_infrastructure as string
          const idx = infra.indexOf(INFRA_MARKER)
          if (idx >= 0) {
            setInfraText(infra.slice(0, idx).trim())
            const tail = infra.slice(idx + INFRA_MARKER.length).replace(/\.\s*$/, '').trim()
            setInfraChecks(tail.split(',').map(x => x.trim()).filter(x => INFRA_OPTIONS.includes(x)))
          } else {
            setInfraText(infra)
          }
        }
      } catch {
        /* fail-safe: abre com o estado atual */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  function toggleInfra(opt: string) {
    setInfraChecks(prev =>
      prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]
    )
  }

  function appendChip(chip: string) {
    setObjective(prev => tidyProfileText(prev ? `${prev}. ${chip}` : chip))
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')

    const infraFull = [
      infraText.trim(),
      infraChecks.length ? `${INFRA_MARKER} ${infraChecks.join(', ')}.` : '',
    ].filter(Boolean).join(' ')

    // Update PARCIAL: os obrigatorios (sempre validados) vao sempre; os opcionais
    // (infra, objetivo) SO entram quando preenchidos. Assim um campo em branco nunca
    // sobrescreve um valor existente com vazio. Upsert em cima do user_id: numa linha
    // ja existente, so as chaves enviadas sao atualizadas; as demais ficam intactas.
    const payload: Record<string, unknown> = {
      user_id:        userId,
      company_name:   companyName.trim(),
      sector,
      company_size:   companySize,
      maturity_level: maturity,
    }
    if (infraFull)        payload.current_infrastructure = infraFull
    if (objective.trim()) payload.strategic_objective    = tidyProfileText(objective)

    const supabase = createSupabaseBrowser()
    const { error: err } = await supabase.from('advisor_profiles').upsert(payload, { onConflict: 'user_id' })

    setSaving(false)
    if (err) { setError(err.message); return }
    onComplete()
  }

  const inputCls = `w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm text-zinc-900
    placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-taime-600
    focus:border-transparent disabled:opacity-60`

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                transition-colors shrink-0
                ${n < step  ? 'bg-taime-600 text-white'
                : n === step ? 'bg-taime-600 text-white ring-4 ring-taime-100'
                             : 'bg-zinc-100 text-zinc-400'}`}>
                {n < step ? '✓' : n}
              </div>
              {n < 4 && <div className={`h-0.5 flex-1 ${n < step ? 'bg-taime-600' : 'bg-zinc-100'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">

          {/* Estado de carregamento discreto enquanto busca o perfil salvo. */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-400" aria-live="polite">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {L.loading}
            </div>
          )}

          {/* ── STEP 1 — Empresa ─────────────────────────────────────── */}
          {!loading && step === 1 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">{L.s1Title}</h2>
              <p className="text-sm text-zinc-500 mb-6">{L.s1Desc}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {L.companyLabel} <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder={L.companyPh} className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {L.sectorLabel} <span className="text-red-400">*</span>
                  </label>
                  <select value={sector} onChange={e => setSector(e.target.value)} className={inputCls}>
                    <option value="" disabled>{L.sectorPh}</option>
                    {SECTORS.map(s => <option key={s} value={s}>{L.sectors[s as keyof typeof L.sectors] ?? s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    {L.sizeLabel} <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SIZES.map(sz => (
                      <button key={sz} type="button" onClick={() => setCompanySize(sz)}
                        className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors
                          ${companySize === sz
                            ? 'border-taime-600 bg-taime-50 text-taime-700 font-medium'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
                        {L.sizes[sz as keyof typeof L.sizes] ?? sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!companyName.trim() || !sector || !companySize}
                className="w-full btn-primary justify-center py-3 mt-6 disabled:opacity-60">
                {L.next}
              </button>
            </>
          )}

          {/* ── STEP 2 — Infraestrutura ──────────────────────────────── */}
          {!loading && step === 2 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">{L.s2Title}</h2>
              <p className="text-sm text-zinc-500 mb-6">{L.s2Desc}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">{L.infraLabel}</label>
                  <textarea rows={3} value={infraText} onChange={e => setInfraText(e.target.value)}
                    placeholder={L.infraPh}
                    className={`${inputCls} resize-none`} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    {L.techLabel} <span className="text-zinc-400 text-xs">{L.techHint}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INFRA_OPTIONS.map(opt => (
                      <button key={opt} type="button" onClick={() => toggleInfra(opt)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors
                          ${infraChecks.includes(opt)
                            ? 'border-taime-600 bg-taime-50 text-taime-700 font-medium'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
                        {L.infra[opt as keyof typeof L.infra] ?? opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1 justify-center py-3">{L.back}</button>
                <button onClick={() => setStep(3)} className="btn-primary flex-1 justify-center py-3">{L.next}</button>
              </div>
            </>
          )}

          {/* ── STEP 3 — Objetivo estratégico ───────────────────────── */}
          {!loading && step === 3 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">{L.s3Title}</h2>
              <p className="text-sm text-zinc-500 mb-6">{L.s3Desc}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">{L.objLabel}</label>
                  <textarea rows={3} value={objective} onChange={e => setObjective(e.target.value)}
                    placeholder={L.objPh}
                    className={`${inputCls} resize-none`} />
                </div>

                <div>
                  <p className="text-xs text-zinc-400 mb-2">{L.suggestions}</p>
                  <div className="flex flex-wrap gap-2">
                    {L.objectiveChips.map(chip => (
                      <button key={chip} type="button" onClick={() => appendChip(chip)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-600
                                   hover:border-taime-300 hover:text-taime-700 transition-colors">
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="btn-secondary flex-1 justify-center py-3">{L.back}</button>
                <button onClick={() => setStep(4)} className="btn-primary flex-1 justify-center py-3">{L.next}</button>
              </div>
            </>
          )}

          {/* ── STEP 4 — Maturidade ──────────────────────────────────── */}
          {!loading && step === 4 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">{L.s4Title}</h2>
              <p className="text-sm text-zinc-500 mb-6">{L.s4Desc}</p>

              <div className="space-y-3">
                {MATURITY_VALUES.map(value => {
                  const opt = L.maturity[value]
                  return (
                    <button key={value} type="button" onClick={() => setMaturity(value)}
                      className={`w-full text-left px-5 py-4 rounded-xl border transition-colors
                        ${maturity === value
                          ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600'
                          : 'border-zinc-200 hover:border-zinc-300'}`}>
                      <p className={`text-sm font-semibold mb-0.5 ${maturity === value ? 'text-taime-700' : 'text-zinc-900'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-zinc-500">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>

              {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(3)} className="btn-secondary flex-1 justify-center py-3">{L.back}</button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !maturity}
                  className="btn-primary flex-1 justify-center py-3 disabled:opacity-60">
                  {saving ? L.saving : L.submit}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
