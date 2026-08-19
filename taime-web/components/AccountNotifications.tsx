'use client'

import { useState } from 'react'
import { useLocale } from '@/lib/useLocale'

// Preferencias de alertas do Advisor (Fase 3.1, TAREFA 4). Tres controles: receber
// sinal novo (on por padrao), receber lembretes de acao parada (off por padrao),
// desativar tudo (precedencia). Salva cada mudanca via /api/account/notifications.
type Prefs = { alert_new_signal: boolean; alert_stalled_action: boolean; alerts_muted: boolean }

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40
        ${on ? 'bg-taime-600' : 'bg-zinc-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4.5' : 'translate-x-1'}`}
        style={{ transform: on ? 'translateX(18px)' : 'translateX(3px)' }} />
    </button>
  )
}

export default function AccountNotifications({ initial }: { initial: Prefs }) {
  const { locale } = useLocale()
  const isPt = locale === 'pt'
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)                 // otimista
    setSaving(true); setError(false)
    try {
      const res = await fetch('/api/account/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setPrefs(prefs)              // reverte
      setError(true)
    } finally { setSaving(false) }
  }

  const t = isPt ? {
    title: 'Alertas do Advisor',
    subtitle: 'O Advisor volta a você quando algo relevante muda. Nunca é newsletter.',
    newSignal: 'Alertas de sinal novo',
    newSignalHint: 'Quando uma análise nova toca um dos temas dos seus planos.',
    stalled: 'Lembretes de ação parada',
    stalledHint: 'Quando uma ação da fase atual fica parada por muito tempo.',
    muted: 'Desativar todos os alertas',
    mutedHint: 'Nenhum email de alerta, independente das opções acima.',
    err: 'Não deu para salvar. Tente de novo.',
  } : {
    title: 'Advisor alerts',
    subtitle: 'The Advisor comes back to you when something relevant changes. Never a newsletter.',
    newSignal: 'New signal alerts',
    newSignalHint: 'When a new analysis touches one of your plan themes.',
    stalled: 'Stalled action reminders',
    stalledHint: 'When an action in the current phase sits idle too long.',
    muted: 'Turn off all alerts',
    mutedHint: 'No alert emails at all, regardless of the options above.',
    err: 'Could not save. Please try again.',
  }

  const rowCls = 'flex items-start justify-between gap-4 py-3.5'
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <header className="px-6 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-bold text-zinc-900">{t.title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{t.subtitle}</p>
      </header>
      <div className="px-6 divide-y divide-zinc-100">
        <div className={rowCls}>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${prefs.alerts_muted ? 'text-zinc-400' : 'text-zinc-800'}`}>{t.newSignal}</p>
            <p className="text-xs text-zinc-400 leading-snug">{t.newSignalHint}</p>
          </div>
          <Switch on={prefs.alert_new_signal && !prefs.alerts_muted} disabled={saving || prefs.alerts_muted}
            onClick={() => update({ alert_new_signal: !prefs.alert_new_signal })} label={t.newSignal} />
        </div>
        <div className={rowCls}>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${prefs.alerts_muted ? 'text-zinc-400' : 'text-zinc-800'}`}>{t.stalled}</p>
            <p className="text-xs text-zinc-400 leading-snug">{t.stalledHint}</p>
          </div>
          <Switch on={prefs.alert_stalled_action && !prefs.alerts_muted} disabled={saving || prefs.alerts_muted}
            onClick={() => update({ alert_stalled_action: !prefs.alert_stalled_action })} label={t.stalled} />
        </div>
        <div className={rowCls}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800">{t.muted}</p>
            <p className="text-xs text-zinc-400 leading-snug">{t.mutedHint}</p>
          </div>
          <Switch on={prefs.alerts_muted} disabled={saving}
            onClick={() => update({ alerts_muted: !prefs.alerts_muted })} label={t.muted} />
        </div>
      </div>
      {error && <p className="px-6 pb-4 text-xs text-amber-700">{t.err}</p>}
    </section>
  )
}
