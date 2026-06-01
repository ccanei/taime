'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ValidationFlag } from '../ReportsAdmin'
import { parseField, twin, readValue, fieldLabel } from '@/lib/reportFieldPath'

type Action = 'publish' | 'reject' | 'archive' | 'unpublish' | 'reopen' | 'restore'

const VERDICT: Record<string, { label: string; cls: string }> = {
  pass:         { label: 'Validação OK',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_review: { label: 'Precisa de revisão',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  fail:         { label: 'Flags bloqueantes',     cls: 'bg-red-50 text-red-700 border-red-200' },
  stale:        { label: 'Editado · revalidar',   cls: 'bg-sky-50 text-sky-700 border-sky-200' },
}

const SEVERITY: Record<string, string> = {
  blocking: 'bg-red-50 border-red-200 text-red-700',
  warning:  'bg-amber-50 border-amber-200 text-amber-700',
  info:     'bg-zinc-50 border-zinc-200 text-zinc-600',
}

const CATEGORY_LABEL: Record<string, string> = {
  deterministic: 'Regra',
  grounding:     'Fato',
  temporal:      'Tempo',
  source:        'Fonte',
}

function actionsFor(status: string): { action: Action; label: string; style: string; confirm?: string }[] {
  switch (status) {
    case 'pending_review':
    case 'generating':
    case 'draft':
      return [
        { action: 'publish', label: 'Publicar',  style: 'bg-emerald-600 text-white hover:bg-emerald-700' },
        { action: 'reject',  label: 'Recusar',   style: 'bg-red-600 text-white hover:bg-red-700' },
        { action: 'archive', label: 'Arquivar',  style: 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300' },
      ]
    case 'published':
      return [
        { action: 'unpublish', label: 'Despublicar', style: 'bg-amber-600 text-white hover:bg-amber-700', confirm: 'Despublicar este relatório? Ele sai do ar e volta para revisão.' },
        { action: 'archive',   label: 'Arquivar',    style: 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300', confirm: 'Arquivar este relatório publicado? Ele sai do ar.' },
      ]
    case 'rejected':
      return [
        { action: 'reopen',  label: 'Reabrir',   style: 'bg-amber-600 text-white hover:bg-amber-700' },
        { action: 'archive', label: 'Arquivar',  style: 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300' },
      ]
    case 'archived':
      return [
        { action: 'restore', label: 'Restaurar', style: 'bg-amber-600 text-white hover:bg-amber-700' },
      ]
    default:
      return []
  }
}

// ─── Editor de um flag (PT + EN) ───────────────────────────────────────────────

function FlagEditor({
  flag, reportId, trends, onSaved,
}: {
  flag: ValidationFlag
  reportId: string
  trends: Record<string, unknown>[]
  onSaved: () => void
}) {
  const parsed = flag.field ? parseField(flag.field) : null

  const trend = flag.trend_rank != null
    ? trends.find(t => (t as { rank?: number }).rank === flag.trend_rank)
    : undefined

  let initialPt = ''
  let initialEn = ''
  if (parsed) {
    const ptField = parsed.lang === 'pt-BR' ? parsed : twin(parsed)
    const enField = parsed.lang === 'en' ? parsed : twin(parsed)
    if (trend) {
      initialPt = readValue(trend, ptField)
      initialEn = readValue(trend, enField)
    }
  }

  const [open, setOpen] = useState(false)
  const [pt, setPt] = useState(initialPt)
  const [en, setEn] = useState(initialEn)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const editable = parsed != null && trend != null

  // Salva valores explícitos. Para "Aceitar sugestão", passamos a sugestão direto,
  // caindo no texto atual quando a sugestão de um idioma é null (não flagueado).
  async function saveWith(valuePt: string, valueEn: string) {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/admin/report-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          trendId: trend ? ((trend as { id?: string }).id ?? null) : null,
          field: flag.field,
          valuePt,
          valueEn,
        }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !json.success) { setErr(json.error ?? 'Erro ao salvar'); return }
      onSaved()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  function save() { return saveWith(pt, en) }

  // Aceita a sugestão: usa o texto sugerido onde existe, mantém o atual onde a
  // sugestão é null (idioma não flagueado).
  function acceptSuggestion() {
    const newPt = flag.suggestion_pt ?? initialPt
    const newEn = flag.suggestion_en ?? initialEn
    return saveWith(newPt, newEn)
  }

  // Abre o editor com a sugestão pré-preenchida, para o humano ajustar antes de salvar.
  function editFromSuggestion() {
    setPt(flag.suggestion_pt ?? initialPt)
    setEn(flag.suggestion_en ?? initialEn)
    setOpen(true)
  }

  return (
    <div className={`rounded-xl border p-3 ${SEVERITY[flag.severity] ?? SEVERITY.info}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/60">
          {CATEGORY_LABEL[flag.category] ?? flag.category}
        </span>
        {flag.trend_rank != null && <span className="text-[11px] font-semibold">Trend {flag.trend_rank}</span>}
        {parsed && <span className="text-[11px] font-medium">{fieldLabel(parsed)}</span>}
        <code className="text-[10px] opacity-60">{flag.field}</code>
      </div>
      <p className="text-sm font-medium leading-snug">{flag.detail}</p>
      {flag.claim && <p className="mt-1 text-xs italic opacity-80 leading-snug">&ldquo;{flag.claim}&rdquo;</p>}

      {/* Sugestão do copiloto corretor */}
      {editable && (flag.suggestion_pt || flag.suggestion_en) && (
        <div className="mt-2 rounded-lg bg-violet-50 border border-violet-200 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-bold text-violet-700">✨ Sugestão da IA</span>
          </div>
          {flag.suggestion_pt && (
            <div className="mb-1.5">
              <span className="text-[10px] font-bold text-violet-500 uppercase">PT</span>
              <p className="text-xs text-violet-900 leading-snug">{flag.suggestion_pt}</p>
            </div>
          )}
          {flag.suggestion_en && (
            <div className="mb-1.5">
              <span className="text-[10px] font-bold text-violet-500 uppercase">EN</span>
              <p className="text-xs text-violet-900 leading-snug">{flag.suggestion_en}</p>
            </div>
          )}
          {flag.suggestion_reason && (
            <p className="text-[11px] text-violet-600 italic mb-2">Por quê: {flag.suggestion_reason}</p>
          )}
          {!open && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => acceptSuggestion()}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Aceitar sugestão'}
              </button>
              <button
                onClick={() => editFromSuggestion()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                Editar antes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sugestão impossível: corretor admitiu que requer reescrita manual */}
      {editable && !flag.suggestion_pt && !flag.suggestion_en && flag.suggestion_reason && (
        <p className="mt-2 text-[11px] text-zinc-500 italic">
          IA não propôs correção automática: {flag.suggestion_reason}
        </p>
      )}

      {editable ? (
        <div className="mt-2">
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="text-xs font-semibold underline underline-offset-2 hover:opacity-70"
            >
              Corrigir manualmente
            </button>
          ) : (
            <div className="mt-2 space-y-2 bg-white/70 rounded-lg p-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">Português</label>
                <textarea
                  value={pt} onChange={e => setPt(e.target.value)} rows={3}
                  className="w-full text-sm rounded-md border border-zinc-300 p-2 text-zinc-800 focus:outline-none focus:ring-2 focus:ring-taime-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">English</label>
                <textarea
                  value={en} onChange={e => setEn(e.target.value)} rows={3}
                  className="w-full text-sm rounded-md border border-zinc-300 p-2 text-zinc-800 focus:outline-none focus:ring-2 focus:ring-taime-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={save} disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-taime-600 text-white hover:bg-taime-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar correção'}
                </button>
                <button
                  onClick={() => { setOpen(false); setPt(initialPt); setEn(initialEn); setErr(null) }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-700"
                >
                  Cancelar
                </button>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[11px] opacity-60">
          Este flag não tem campo editável direto (ex: erro de parsing do validador). Revise no relatório abaixo.
        </p>
      )}
    </div>
  )
}

// ─── Painel principal ───────────────────────────────────────────────────────

export default function ReviewPanel({
  reportId, status, verdict, flags, signalCount, trends,
}: {
  reportId: string
  status: string
  verdict: string | null
  flags: ValidationFlag[]
  signalCount: number | null
  trends: Record<string, unknown>[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  const blocking = flags.filter(f => f.severity === 'blocking')
  const warning  = flags.filter(f => f.severity === 'warning')
  const v = verdict ? VERDICT[verdict] : null
  const actions = actionsFor(status)

  async function run(action: Action, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(action); setError(null)
    try {
      const res = await fetch('/api/admin/report-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, action }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !json.success) { setError(json.error ?? 'Erro desconhecido'); return }
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {v && (
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${v.cls}`}>
            {v.label}
          </span>
        )}
        {signalCount !== null && <span className="text-sm text-zinc-500">{signalCount} sinais no período</span>}
        {blocking.length > 0 && <span className="text-sm text-red-600 font-medium">{blocking.length} bloqueante{blocking.length > 1 ? 's' : ''}</span>}
        {warning.length > 0 && <span className="text-sm text-amber-600 font-medium">{warning.length} aviso{warning.length > 1 ? 's' : ''}</span>}
      </div>

      {/* Aviso de revalidação pendente */}
      {verdict === 'stale' && (
        <div className="mb-5 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-800">
          Relatório editado manualmente. Para confirmar que as correções limparam os flags,
          rode no terminal: <code className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded">PERIOD=&lt;período&gt; npx ts-node validate-report.ts</code>
        </div>
      )}

      {/* Flags */}
      {flags.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-5">
          Nenhuma flag. {verdict === 'pass' ? 'Este relatório passou limpo na validação.' : 'Sem ocorrências pendentes.'}
        </p>
      ) : (
        <div className="space-y-2 mb-5 max-h-[520px] overflow-y-auto pr-1">
          {[...blocking, ...warning].map((f, i) => (
            <FlagEditor
              key={`${f.field}-${i}`}
              flag={f}
              reportId={reportId}
              trends={trends}
              onSaved={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-zinc-100">
        {actions.map(({ action, label, style, confirm }) => (
          <button
            key={action}
            onClick={() => run(action, confirm)}
            disabled={!!busy}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${style}`}
          >
            {busy === action ? '...' : label}
          </button>
        ))}
        {blocking.length > 0 && (status === 'pending_review' || status === 'generating') && (
          <span className="text-xs text-zinc-400 ml-1">
            Você pode publicar mesmo com flags bloqueantes. A decisão é sua.
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
