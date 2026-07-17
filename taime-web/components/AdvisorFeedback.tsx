'use client'

import { useState } from 'react'

// Controles discretos de feedback sob cada resposta do Advisor (chat logado e
// /ask anonimo). Clique no polegar grava o voto na hora; um campo opcional de
// comentario aparece em seguida e complementa a MESMA avaliacao. Sobrio e nao
// intrusivo; nunca bloqueia a conversa.
export default function AdvisorFeedback({
  question, answer, source, isPt,
}: {
  question: string
  answer:   string
  source:   'advisor' | 'ask'
  isPt:     boolean
}) {
  const [rating,   setRating]   = useState<null | 'up' | 'down'>(null)
  const [rowId,    setRowId]    = useState<string | null>(null)
  const [comment,  setComment]  = useState('')
  const [sent,     setSent]     = useState(false)   // comentario enviado
  const [busy,     setBusy]     = useState(false)

  async function vote(r: 'up' | 'down') {
    if (rating || busy) return
    setRating(r)
    setBusy(true)
    try {
      const res = await fetch('/api/advisor/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rating: r, question, answer, source,
          locale: isPt ? 'pt-BR' : 'en',
        }),
      })
      const json = await res.json() as { id?: string | null }
      if (json?.id) setRowId(json.id)
    } catch {
      /* feedback e opcional: falha silenciosa, o voto ja aparece selecionado */
    } finally {
      setBusy(false)
    }
  }

  async function sendComment() {
    const c = comment.trim()
    if (!c || !rowId || sent) { setSent(true); return }
    try {
      await fetch('/api/advisor/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: rowId, comment: c }),
      })
    } catch {
      /* silencioso */
    } finally {
      setSent(true)
    }
  }

  const thumbBtn = (r: 'up' | 'down', label: string, path: string) => (
    <button
      type="button"
      onClick={() => vote(r)}
      disabled={!!rating || busy}
      aria-label={label}
      title={label}
      className={`p-1 rounded-md transition-colors disabled:cursor-default
        ${rating === r ? 'text-taime-700' : 'text-zinc-300 hover:text-zinc-500'}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  )

  const UP   = 'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'
  const DOWN = 'M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z'

  return (
    <div className="mt-2 pt-2 border-t border-zinc-100">
      {!rating ? (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-zinc-400 mr-1">{isPt ? 'Foi útil?' : 'Was this helpful?'}</span>
          {thumbBtn('up',   isPt ? 'Útil'     : 'Helpful',     UP)}
          {thumbBtn('down', isPt ? 'Não útil' : 'Not helpful', DOWN)}
        </div>
      ) : sent ? (
        <p className="text-[11px] text-zinc-400">{isPt ? 'Obrigado pelo retorno.' : 'Thanks for the feedback.'}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            {thumbBtn('up',   isPt ? 'Útil'     : 'Helpful',     UP)}
            {thumbBtn('down', isPt ? 'Não útil' : 'Not helpful', DOWN)}
            <span className="text-[11px] text-zinc-400 ml-1">
              {isPt ? 'Quer contar o motivo? (opcional)' : 'Want to tell us why? (optional)'}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendComment() } }}
              maxLength={2000}
              placeholder={isPt ? 'Comentário curto...' : 'Short comment...'}
              className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-800
                         placeholder:text-zinc-400 outline-none focus:ring-1 focus:ring-taime-500"
            />
            <button
              type="button"
              onClick={sendComment}
              className="text-[11px] font-medium text-taime-700 hover:text-taime-800 px-2 py-1 shrink-0">
              {isPt ? 'Enviar' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
