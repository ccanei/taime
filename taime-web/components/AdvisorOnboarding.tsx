'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

const SECTORS = [
  'Tecnologia', 'Financeiro', 'Saúde', 'Varejo',
  'Indústria', 'Serviços', 'Educação', 'Outro',
]

const SIZES = [
  '1-10 funcionários',
  '11-50 funcionários',
  '51-200 funcionários',
  '201-1000 funcionários',
  '1000+ funcionários',
]

const INFRA_OPTIONS = [
  'On-premise', 'Cloud pública', 'Cloud híbrida',
  'SaaS', 'Legacy systems', 'IA em uso',
]

const OBJECTIVE_CHIPS = [
  'Migrar para cloud',
  'Implementar IA agêntica',
  'Modernizar infraestrutura',
  'Reduzir custos operacionais',
  'Expandir para novos mercados',
]

const MATURITY_OPTIONS = [
  { value: 'inicial',       label: 'Inicial',        desc: 'Ainda explorando as possibilidades tecnológicas' },
  { value: 'intermediário', label: 'Intermediário',   desc: 'Alguns projetos em andamento, base estabelecida' },
  { value: 'avançado',      label: 'Avançado',        desc: 'Operações digitais maduras e times especializados' },
]

interface Props {
  userId: string
  onComplete: () => void
}

export default function AdvisorOnboarding({ userId, onComplete }: Props) {
  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // Step 1
  const [companyName, setCompanyName] = useState('')
  const [sector, setSector]           = useState('')
  const [companySize, setCompanySize] = useState('')

  // Step 2
  const [infraText, setInfraText]         = useState('')
  const [infraChecks, setInfraChecks]     = useState<string[]>([])

  // Step 3
  const [objective, setObjective] = useState('')

  // Step 4
  const [maturity, setMaturity] = useState('')

  function toggleInfra(opt: string) {
    setInfraChecks(prev =>
      prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]
    )
  }

  function appendChip(chip: string) {
    setObjective(prev => prev ? `${prev}. ${chip}` : chip)
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')

    const infraFull = [
      infraText.trim(),
      infraChecks.length ? `Tecnologias em uso: ${infraChecks.join(', ')}.` : '',
    ].filter(Boolean).join(' ')

    const supabase = createSupabaseBrowser()
    const { error: err } = await supabase.from('advisor_profiles').upsert({
      user_id:                userId,
      company_name:           companyName.trim(),
      sector,
      company_size:           companySize,
      current_infrastructure: infraFull || null,
      strategic_objective:    objective.trim() || null,
      maturity_level:         maturity,
    }, { onConflict: 'user_id' })

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

          {/* ── STEP 1 — Empresa ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Sua empresa</h2>
              <p className="text-sm text-zinc-500 mb-6">Contexto organizacional para personalizar a análise.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Nome da empresa <span className="text-red-400">*</span>
                  </label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Ex: Acme Corp" className={inputCls} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Setor <span className="text-red-400">*</span>
                  </label>
                  <select value={sector} onChange={e => setSector(e.target.value)} className={inputCls}>
                    <option value="" disabled>Selecione o setor</option>
                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Tamanho <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SIZES.map(sz => (
                      <button key={sz} type="button" onClick={() => setCompanySize(sz)}
                        className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors
                          ${companySize === sz
                            ? 'border-taime-600 bg-taime-50 text-taime-700 font-medium'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!companyName.trim() || !sector || !companySize}
                className="w-full btn-primary justify-center py-3 mt-6 disabled:opacity-60">
                Próximo →
              </button>
            </>
          )}

          {/* ── STEP 2 — Infraestrutura ──────────────────────────────── */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Infraestrutura atual</h2>
              <p className="text-sm text-zinc-500 mb-6">Como está hoje o seu ambiente tecnológico?</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Descreva sua infraestrutura tecnológica atual
                  </label>
                  <textarea rows={3} value={infraText} onChange={e => setInfraText(e.target.value)}
                    placeholder="Ex: Usamos Azure para cloud, SQL Server on-premise para sistemas legados, Salesforce para CRM..."
                    className={`${inputCls} resize-none`} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Tecnologias em uso <span className="text-zinc-400 text-xs">(marque todas que se aplicam)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INFRA_OPTIONS.map(opt => (
                      <button key={opt} type="button" onClick={() => toggleInfra(opt)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors
                          ${infraChecks.includes(opt)
                            ? 'border-taime-600 bg-taime-50 text-taime-700 font-medium'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1 justify-center py-3">
                  ← Voltar
                </button>
                <button onClick={() => setStep(3)} className="btn-primary flex-1 justify-center py-3">
                  Próximo →
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3 — Objetivo estratégico ───────────────────────── */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Objetivo estratégico</h2>
              <p className="text-sm text-zinc-500 mb-6">Qual é o foco principal para os próximos 12-18 meses?</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Descreva seu objetivo estratégico
                  </label>
                  <textarea rows={3} value={objective} onChange={e => setObjective(e.target.value)}
                    placeholder="Ex: Modernizar a infraestrutura de dados e implementar capacidades de IA para otimizar operações..."
                    className={`${inputCls} resize-none`} />
                </div>

                <div>
                  <p className="text-xs text-zinc-400 mb-2">Sugestões:</p>
                  <div className="flex flex-wrap gap-2">
                    {OBJECTIVE_CHIPS.map(chip => (
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
                <button onClick={() => setStep(2)} className="btn-secondary flex-1 justify-center py-3">
                  ← Voltar
                </button>
                <button onClick={() => setStep(4)} className="btn-primary flex-1 justify-center py-3">
                  Próximo →
                </button>
              </div>
            </>
          )}

          {/* ── STEP 4 — Maturidade ──────────────────────────────────── */}
          {step === 4 && (
            <>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Maturidade tecnológica</h2>
              <p className="text-sm text-zinc-500 mb-6">Como você avalia o nível atual da sua empresa?</p>

              <div className="space-y-3">
                {MATURITY_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setMaturity(opt.value)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition-colors
                      ${maturity === opt.value
                        ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600'
                        : 'border-zinc-200 hover:border-zinc-300'}`}>
                    <p className={`text-sm font-semibold mb-0.5 ${maturity === opt.value ? 'text-taime-700' : 'text-zinc-900'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-zinc-500">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(3)} className="btn-secondary flex-1 justify-center py-3">
                  ← Voltar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !maturity}
                  className="btn-primary flex-1 justify-center py-3 disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Iniciar conversa →'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
