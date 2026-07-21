'use client'

import { useState } from 'react'

// Popup de contato humano dentro do Advisor logado. Campos minimos: assunto (select)
// e mensagem. Nome/email/plano vem da sessao no servidor (nao pergunta de novo).
// Grava com o conversation_id (session_id da conversa atual). Padrao visual do site.
const SUBJECTS: { value: 'Comercial' | 'Suporte' | 'Feedback' | 'Outro'; pt: string; en: string }[] = [
  { value: 'Comercial', pt: 'Comercial', en: 'Sales' },
  { value: 'Suporte',   pt: 'Suporte',   en: 'Support' },
  { value: 'Feedback',  pt: 'Feedback',  en: 'Feedback' },
  { value: 'Outro',     pt: 'Outro',     en: 'Other' },
]

export default function AdvisorContactModal({
  isPt, conversationId, onClose,
}: {
  isPt:           boolean
  conversationId: string | null
  onClose:        () => void
}) {
  const [subject, setSubject] = useState<string>('Comercial')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const L = isPt
    ? {
        title:  'Falar com a equipe',
        sub:    'O Advisor segue disponível. Se preferir falar com uma pessoa do time, conte o que precisa.',
        subject: 'Assunto',
        message: 'Mensagem',
        placeholder: 'Como podemos ajudar?',
        notice: 'A equipe poderá ver esta conversa para te atender melhor.',
        send:   'Enviar pedido',
        sending: 'Enviando...',
        ok:     'Pedido enviado. A equipe entra em contato pelo seu email.',
        err:    'Não foi possível enviar. Tente novamente.',
        close:  'Fechar',
        cancel: 'Cancelar',
      }
    : {
        title:  'Talk to the team',
        sub:    'The Advisor is still here. If you prefer to reach a person on the team, tell us what you need.',
        subject: 'Subject',
        message: 'Message',
        placeholder: 'How can we help?',
        notice: 'The team may view this conversation to assist you better.',
        send:   'Send request',
        sending: 'Sending...',
        ok:     'Request sent. The team will reach you by email.',
        err:    'Could not send. Please try again.',
        close:  'Close',
        cancel: 'Cancel',
      }

  async function submit() {
    const m = message.trim()
    if (!m || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/advisor/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subject, message: m, conversationId }),
      })
      if (!res.ok) { setStatus('error'); return }
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-zinc-200 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-bold text-zinc-900">{L.title}</h2>
          <button onClick={onClose} aria-label={L.close}
                  className="text-zinc-400 hover:text-zinc-700 -mt-1 -mr-1 p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {status === 'sent' ? (
          <>
            <p className="text-sm text-emerald-700 leading-relaxed mt-3 mb-6">{L.ok}</p>
            <button onClick={onClose} className="btn-primary text-sm px-5 py-2.5 w-full justify-center">
              {L.close}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-500 leading-relaxed mb-5">{L.sub}</p>

            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">{L.subject}</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full mb-4 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900
                         outline-none focus:ring-2 focus:ring-taime-600 bg-white"
            >
              {SUBJECTS.map(s => (
                <option key={s.value} value={s.value}>{isPt ? s.pt : s.en}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-zinc-500 mb-1.5">{L.message}</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={L.placeholder}
              rows={4}
              maxLength={4000}
              className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2.5 text-sm
                         text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-taime-600
                         leading-relaxed mb-3"
            />

            <p className="text-[11px] text-zinc-400 leading-relaxed mb-5">{L.notice}</p>

            {status === 'error' && <p className="text-sm text-red-600 mb-3">{L.err}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={onClose}
                      className="btn-secondary text-sm px-4 py-2.5">
                {L.cancel}
              </button>
              <button
                onClick={submit}
                disabled={!message.trim() || status === 'sending'}
                className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed">
                {status === 'sending' ? L.sending : L.send}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
