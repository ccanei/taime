'use client'

import { useState } from 'react'

export interface MarketingPost {
  id:               string
  created_at:       string
  period:           string | null
  trend_id:         string | null
  trend_title:      string | null
  question:         string | null
  advisor_response: string | null
  post_pt:          string | null
  post_en:          string | null
  status:           string
  published_at:     string | null
  published_pt:     string | null
  published_en:     string | null
  source:           string
}

type Status = 'draft' | 'approved' | 'published'
const STATUS_FLOW: Record<Status, Status | null> = { draft: 'approved', approved: 'published', published: null }
const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-zinc-100 text-zinc-600 border-zinc-200',
  approved:  'bg-blue-50 text-blue-700 border-blue-100',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-100',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    catch { /* clipboard indisponivel */ }
  }
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-1 border transition-colors
        ${copied ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 text-zinc-500 hover:border-taime-200 hover:text-taime-700'}`}
    >
      {copied ? '✓ Copiado' : `Copiar ${label}`}
    </button>
  )
}

function PostBlock({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 bg-white">
        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{title}</span>
        {text && <CopyButton text={text} label={title} />}
      </div>
      <pre className="px-3 py-3 text-xs text-zinc-700 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-80 overflow-y-auto">
        {text ?? '(vazio)'}
      </pre>
    </div>
  )
}

// Seccao "Publicado": textareas editaveis com o texto EXATO que saiu no LinkedIn.
// Posts manuais tambem editam titulo e pergunta aqui.
function PublishedSection({ post, onSaved }: { post: MarketingPost; onSaved: (patch: Partial<MarketingPost>) => void }) {
  const isManual = post.source === 'manual'
  const [pubPt,    setPubPt]    = useState(post.published_pt ?? '')
  const [pubEn,    setPubEn]    = useState(post.published_en ?? '')
  const [title,    setTitle]    = useState(post.trend_title ?? '')
  const [question, setQuestion] = useState(post.question ?? '')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  const dirty =
    pubPt !== (post.published_pt ?? '') ||
    pubEn !== (post.published_en ?? '') ||
    (isManual && (title !== (post.trend_title ?? '') || question !== (post.question ?? '')))

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: post.id, action: 'save-published',
        published_pt: pubPt, published_en: pubEn,
      }
      if (isManual) { body.trend_title = title; body.question = question }
      const res = await fetch('/api/admin/post-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) return
      const patch: Partial<MarketingPost> = { published_pt: pubPt || null, published_en: pubEn || null }
      if (isManual) { patch.trend_title = title || null; patch.question = question || null }
      onSaved(patch)
      setSaved(true); setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  const taCls = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 leading-relaxed ' +
    'focus:outline-none focus:border-taime-300 focus:ring-1 focus:ring-taime-200 resize-y min-h-[120px]'

  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Publicado</span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] font-semibold text-emerald-600">✓ Salvo</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 disabled:opacity-40 transition-colors">
            {saving ? 'Salvando...' : 'Salvar publicado'}
          </button>
        </div>
      </div>

      {isManual && (
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Título (opcional)</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Tema/título do post"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-taime-300 focus:ring-1 focus:ring-taime-200" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1">Pergunta (opcional)</label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Pergunta feita ao Advisor"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-taime-300 focus:ring-1 focus:ring-taime-200" />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">PT publicado</label>
            {pubPt.trim() && <CopyButton text={pubPt} label="PT publicado" />}
          </div>
          <textarea
            value={pubPt}
            onChange={e => setPubPt(e.target.value)}
            placeholder="Cole aqui a versão publicada"
            className={taCls} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">EN publicado</label>
            {pubEn.trim() && <CopyButton text={pubEn} label="EN publicado" />}
          </div>
          <textarea
            value={pubEn}
            onChange={e => setPubEn(e.target.value)}
            placeholder="Cole aqui a versão publicada"
            className={taCls} />
        </div>
      </div>
    </div>
  )
}

export default function PostsAdmin({ initial }: { initial: MarketingPost[] }) {
  const [rows, setRows]     = useState(initial)
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [busy, setBusy]     = useState<string | null>(null)

  const visible = filter === 'all' ? rows : rows.filter(r => r.status === filter)
  const counts = {
    all:       rows.length,
    draft:     rows.filter(r => r.status === 'draft').length,
    approved:  rows.filter(r => r.status === 'approved').length,
    published: rows.filter(r => r.status === 'published').length,
  }

  function patchRow(id: string, patch: Partial<MarketingPost>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  async function act(id: string, action: 'set-status' | 'delete', status?: Status) {
    // Ao publicar sem a versao publicada (PT) registrada, avisa mas deixa prosseguir.
    if (action === 'set-status' && status === 'published') {
      const row = rows.find(r => r.id === id)
      if (row && !(row.published_pt ?? '').trim()) {
        const go = confirm('O texto publicado (PT) não foi registrado neste post. Marcar como “published” mesmo assim?')
        if (!go) return
      }
    }
    setBusy(id)
    try {
      const res = await fetch('/api/admin/post-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, status }),
      })
      if (!res.ok) return
      if (action === 'delete') {
        setRows(prev => prev.filter(r => r.id !== id))
      } else if (status) {
        setRows(prev => prev.map(r => r.id === id
          ? { ...r, status, published_at: status === 'published' ? new Date().toISOString() : null }
          : r))
      }
    } finally {
      setBusy(null)
    }
  }

  async function addManual() {
    setBusy('new')
    try {
      const res = await fetch('/api/admin/post-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-manual' }),
      })
      if (!res.ok) return
      const { row } = await res.json() as { row?: MarketingPost }
      if (row) { setRows(prev => [row, ...prev]); setFilter('all') }
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<{ k: 'all' | Status; label: string }> = [
    { k: 'all', label: 'Todos' }, { k: 'draft', label: 'Draft' },
    { k: 'approved', label: 'Approved' }, { k: 'published', label: 'Published' },
  ]

  return (
    <div>
      {/* Filtro por status + novo post manual */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${filter === t.k ? 'bg-taime-600 text-white border-taime-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-taime-200'}`}
            >
              {t.label} <span className="tabular-nums opacity-70">{counts[t.k]}</span>
            </button>
          ))}
        </div>
        <button
          onClick={addManual}
          disabled={busy === 'new'}
          className="text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-700 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors whitespace-nowrap">
          {busy === 'new' ? 'Criando...' : '+ Novo post manual'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-400 py-10 text-center">Nenhum post neste filtro.</p>
      ) : (
        <div className="space-y-5">
          {visible.map(p => {
            const nextStatus = STATUS_FLOW[p.status as Status] ?? null
            const isManual   = p.source === 'manual'
            const hasDraft   = Boolean(p.post_pt || p.post_en)
            return (
              <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                {/* Cabecalho do card */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLE[p.status] ?? STATUS_STYLE.draft}`}>
                        {p.status}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border
                        ${isManual ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                        {isManual ? 'manual' : 'máquina'}
                      </span>
                      <span className="text-[11px] text-zinc-400 tabular-nums">{fmtDate(p.created_at)}</span>
                      {p.period && <span className="text-[11px] text-zinc-400">· período {p.period}</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
                      {p.trend_title ?? (isManual ? 'Post manual' : '(sem trend)')}
                    </h3>
                    {p.question && <p className="mt-1 text-xs text-zinc-500 italic leading-snug">{p.question}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {nextStatus && (
                      <button
                        onClick={() => act(p.id, 'set-status', nextStatus)}
                        disabled={busy === p.id}
                        className="text-xs font-semibold text-white bg-taime-600 hover:bg-taime-700 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors whitespace-nowrap">
                        → {nextStatus}
                      </button>
                    )}
                    {p.status !== 'draft' && (
                      <button
                        onClick={() => act(p.id, 'set-status', 'draft')}
                        disabled={busy === p.id}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-800 rounded-lg px-2 py-1.5 disabled:opacity-50 transition-colors">
                        ← draft
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm('Excluir este post?')) act(p.id, 'delete') }}
                      disabled={busy === p.id}
                      className="text-xs font-medium text-red-500 hover:text-red-700 rounded-lg px-2 py-1.5 disabled:opacity-50 transition-colors">
                      Excluir
                    </button>
                  </div>
                </div>

                {/* Draft gerado (so quando existe) */}
                {hasDraft && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <PostBlock title="PT" text={p.post_pt} />
                    <PostBlock title="EN" text={p.post_en} />
                  </div>
                )}

                {/* Versao publicada (editavel) */}
                <PublishedSection post={p} onSaved={patch => patchRow(p.id, patch)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
