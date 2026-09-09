'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/useLocale'
import TurnstileWidget from '@/components/TurnstileWidget'
import {
  THEME_GROUPS, ORG_SIZES, OBJECTIVES, HORIZONS, type Lang,
} from '@/lib/decision-check'

const T = {
  q1:      { pt: 'Qual tecnologia você está considerando?', en: 'Which technology are you considering?' },
  q2:      { pt: 'Tamanho da sua organização',              en: 'Organization size' },
  q3:      { pt: 'Qual seu objetivo?',                       en: 'What is your objective?' },
  q4:      { pt: 'Qual seu horizonte de decisão?',           en: 'What is your decision horizon?' },
  pick:    { pt: 'Selecione...',                             en: 'Select...' },
  submit:  { pt: 'Ver meu Decision Check →',                 en: 'See my Decision Check →' },
  loading: { pt: 'Consultando o arquivo...',                en: 'Consulting the archive...' },
  rate:    { pt: 'Muitas consultas em pouco tempo. Tente novamente daqui a pouco.', en: 'Too many checks in a short time. Please try again shortly.' },
  human:   { pt: 'Confirme que você não é um robô para continuar.', en: 'Confirm you are not a robot to continue.' },
  err:     { pt: 'Algo deu errado. Tente novamente.',       en: 'Something went wrong. Please try again.' },
}

export default function DecisionCheckForm() {
  const { locale } = useLocale()
  const lang = (locale === 'en' ? 'en' : 'pt') as Lang
  const router = useRouter()

  const [theme, setTheme]         = useState('')
  const [size, setSize]           = useState('')
  const [objective, setObjective] = useState('')
  const [horizon, setHorizon]     = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [needHuman, setNeedHuman] = useState(false)
  const [token, setToken]         = useState<string | null>(null)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null
  const ready = theme && size && objective && horizon && !busy

  const onToken = useCallback((t: string | null) => setToken(t), [])

  const sel = 'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white ' +
    'focus:outline-none focus:border-taime-400 focus:ring-1 focus:ring-taime-400 appearance-none'

  async function submit() {
    if (!ready) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/decision-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, size, objective, horizon, turnstileToken: token }),
      })
      if (res.status === 429) { setError(T.rate[lang]); setBusy(false); return }
      if (res.status === 428) { setNeedHuman(true); setError(T.human[lang]); setBusy(false); return }
      const json = await res.json() as { slug?: string; error?: string }
      if (!res.ok || !json.slug) { setError(T.err[lang]); setBusy(false); return }
      router.push(`/decision-check/${json.slug}${lang === 'en' ? '?lang=en' : ''}`)
    } catch {
      setError(T.err[lang]); setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 space-y-5">
      {/* P1: tema (dropdown agrupado) */}
      <div>
        <label className="block text-xs font-semibold text-white/60 mb-2">{T.q1[lang]}</label>
        <select value={theme} onChange={e => setTheme(e.target.value)} className={sel}>
          <option value="" disabled className="bg-taime-900">{T.pick[lang]}</option>
          {THEME_GROUPS.map(g => (
            <optgroup key={g.group.pt} label={g.group[lang]} className="bg-taime-900">
              {g.items.map(i => (
                <option key={i.slug} value={i.slug} className="bg-taime-900">{i.label[lang]}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-2">{T.q2[lang]}</label>
          <select value={size} onChange={e => setSize(e.target.value)} className={sel}>
            <option value="" disabled className="bg-taime-900">{T.pick[lang]}</option>
            {ORG_SIZES.map(o => <option key={o.key} value={o.key} className="bg-taime-900">{o.label[lang]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-2">{T.q3[lang]}</label>
          <select value={objective} onChange={e => setObjective(e.target.value)} className={sel}>
            <option value="" disabled className="bg-taime-900">{T.pick[lang]}</option>
            {OBJECTIVES.map(o => <option key={o.key} value={o.key} className="bg-taime-900">{o.label[lang]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-2">{T.q4[lang]}</label>
          <select value={horizon} onChange={e => setHorizon(e.target.value)} className={sel}>
            <option value="" disabled className="bg-taime-900">{T.pick[lang]}</option>
            {HORIZONS.map(o => <option key={o.key} value={o.key} className="bg-taime-900">{o.label[lang]}</option>)}
          </select>
        </div>
      </div>

      {needHuman && siteKey && (
        <div className="flex justify-center"><TurnstileWidget siteKey={siteKey} onToken={onToken} /></div>
      )}

      {error && <p className="text-sm text-amber-300/90">{error}</p>}

      <button
        onClick={submit}
        disabled={!ready}
        className="w-full rounded-xl bg-taime-600 hover:bg-taime-500 disabled:opacity-40 disabled:cursor-not-allowed
                   text-white font-semibold text-sm px-5 py-3.5 transition-colors">
        {busy ? T.loading[lang] : T.submit[lang]}
      </button>
    </div>
  )
}
