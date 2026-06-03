'use client'

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/useLocale'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type FeedbackType = 'suggestion' | 'problem' | 'praise'

export default function FeedbackWidget() {
  const { t, locale } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'

  const [open,    setOpen]    = useState(false)
  const [type,    setType]    = useState<FeedbackType>('suggestion')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [status,  setStatus]  = useState<Status>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  // Fecha com ESC
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const labels = isPt
    ? {
        button:   'Feedback',
        title:    'Enviar feedback',
        subtitle: 'Conte o que está funcionando, o que pode melhorar ou o que está quebrado.',
        typeLbl:  'Tipo',
        types:    { suggestion: 'Sugestão', problem: 'Problema', praise: 'Elogio' },
        msgLbl:   'Mensagem',
        msgPh:    'Escreva seu feedback...',
        send:     'Enviar',
        sending:  'Enviando...',
        ok:       'Obrigado! Recebemos seu feedback.',
        err:      'Não conseguimos enviar. Tente novamente.',
        empty:    'Escreva uma mensagem antes de enviar.',
        close:    'Fechar',
        another:  'Enviar outro',
      }
    : {
        button:   'Feedback',
        title:    'Send feedback',
        subtitle: "Tell us what's working, what could be better, or what's broken.",
        typeLbl:  'Type',
        types:    { suggestion: 'Suggestion', problem: 'Problem', praise: 'Praise' },
        msgLbl:   'Message',
        msgPh:    'Write your feedback...',
        send:     'Send',
        sending:  'Sending...',
        ok:       'Thanks! We got your feedback.',
        err:      "We couldn't send it. Try again.",
        empty:    'Write a message before sending.',
        close:    'Close',
        another:  'Send another',
      }

  function resetForm() {
    setType('suggestion')
    setMessage('')
    setWebsite('')
    setStatus('idle')
    setErrMsg('')
  }

  function closePanel() {
    setOpen(false)
    // Pequeno delay para a animação terminar antes do reset visual
    setTimeout(resetForm, 200)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      setErrMsg(labels.empty); setStatus('error'); return
    }
    setStatus('sending'); setErrMsg('')
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, message: message.trim(), website, locale }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setErrMsg(data.error ?? labels.err); setStatus('error'); return
      }
      setStatus('sent')
      setMessage('')
    } catch {
      setErrMsg(labels.err); setStatus('error')
    }
  }

  return (
    <>
      {/* Botão fixo, discreto */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2
                   px-3.5 py-2 rounded-full text-xs font-semibold
                   bg-white text-zinc-700 border border-zinc-200 shadow-sm
                   hover:bg-zinc-50 hover:border-taime-200 hover:text-taime-700
                   transition-colors"
        aria-label={labels.button}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {labels.button}
      </button>

      {/* Overlay + painel */}
      {open && (
        <>
          <div
            onClick={closePanel}
            className="fixed inset-0 z-40 bg-zinc-900/30 backdrop-blur-sm"
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px]
                       bg-white shadow-xl border-l border-zinc-200
                       flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-zinc-100">
              <div>
                <h2 id="feedback-title" className="text-base font-bold text-zinc-900">
                  {labels.title}
                </h2>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                  {labels.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="shrink-0 -mr-2 -mt-1 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                aria-label={labels.close}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {status === 'sent' ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-start gap-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2" className="text-emerald-600 mt-0.5 shrink-0"
                         strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-emerald-800 font-medium">{labels.ok}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold
                                 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
                    >
                      {labels.another}
                    </button>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold
                                 text-zinc-500 hover:text-zinc-700 transition-colors"
                    >
                      {labels.close}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Honeypot */}
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
                  >
                    <label htmlFor="fb-website">Website</label>
                    <input
                      id="fb-website"
                      type="text"
                      name="website"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="fb-type" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      {labels.typeLbl}
                    </label>
                    <select
                      id="fb-type"
                      value={type}
                      onChange={e => setType(e.target.value as FeedbackType)}
                      disabled={status === 'sending'}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                                 bg-white text-zinc-900 focus:outline-none focus:ring-2
                                 focus:ring-taime-600 focus:border-transparent disabled:opacity-60"
                    >
                      <option value="suggestion">{labels.types.suggestion}</option>
                      <option value="problem">{labels.types.problem}</option>
                      <option value="praise">{labels.types.praise}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="fb-msg" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      {labels.msgLbl}
                    </label>
                    <textarea
                      id="fb-msg"
                      rows={6}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder={labels.msgPh}
                      disabled={status === 'sending'}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                                 bg-white text-zinc-900 placeholder:text-zinc-400
                                 focus:outline-none focus:ring-2 focus:ring-taime-600
                                 focus:border-transparent disabled:opacity-60 resize-y"
                    />
                  </div>

                  {status === 'error' && errMsg && (
                    <p className="text-xs text-red-600">{errMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold
                               bg-taime-600 text-white hover:bg-taime-700
                               disabled:opacity-60 disabled:cursor-not-allowed
                               transition-colors"
                  >
                    {status === 'sending' ? labels.sending : labels.send}
                  </button>
                </form>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
