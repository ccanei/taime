'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'
import AdvisorMarkdown from '@/components/AdvisorMarkdown'

interface Message {
  id:      string
  role:    'user' | 'assistant'
  content: string
}

const QUESTION_LIMIT = 3

// Tipagem minima do widget global do Turnstile.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string
        callback: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      reset: (id?: string) => void
    }
  }
}

export default function AskChat({ siteKey }: { siteKey: string | null }) {
  const { t } = useLocale()
  const L = t.home.ask

  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [used,     setUsed]     = useState(0)
  const [blocked,  setBlocked]  = useState<null | 'limit' | 'ip'>(null)
  const [error,    setError]    = useState('')
  const [token,    setToken]    = useState<string | null>(null)

  const captchaRef = useRef<HTMLDivElement>(null)
  const widgetRendered = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const needsCaptcha = used === 0 && !!siteKey

  // ── Carrega e renderiza o Turnstile antes da 1a pergunta ───────────────────
  useEffect(() => {
    if (!siteKey || used > 0) return
    let cancelled = false

    function renderWidget() {
      if (cancelled || widgetRendered.current) return
      if (window.turnstile && captchaRef.current) {
        widgetRendered.current = true
        window.turnstile.render(captchaRef.current, {
          sitekey: siteKey!,
          theme:   'light',
          callback: (tk: string) => setToken(tk),
          'expired-callback': () => setToken(null),
          'error-callback':   () => setToken(null),
        })
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      const existing = document.querySelector('script[data-turnstile]')
      if (!existing) {
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', 'true')
        s.onload = renderWidget
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', renderWidget)
      }
      const poll = setInterval(() => { if (window.turnstile) { renderWidget(); clearInterval(poll) } }, 300)
      setTimeout(() => clearInterval(poll), 15000)
    }
    return () => { cancelled = true }
  }, [siteKey, used])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, blocked])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading || blocked) return
    if (needsCaptcha && !token) { setError(L.captchaWait); return }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, token }),
      })
      const json = await res.json() as {
        reply?: string; used?: number; limit?: number; error?: string
      }

      if (res.status === 503) { setBlocked(null); setError(L.unavailable); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if (res.status === 429 && json.error === 'ip_limit') { setBlocked('ip'); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if (res.status === 403 && json.error === 'limit_reached') { setBlocked('limit'); setUsed(QUESTION_LIMIT); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if ((res.status === 403) && (json.error === 'captcha_failed' || json.error === 'captcha_required')) {
        setError(L.captchaFail); setToken(null); widgetRendered.current = false
        setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return
      }
      if (!res.ok || !json.reply) { setError(L.genericError); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }

      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: json.reply! }])
      const nowUsed = json.used ?? used + 1
      setUsed(nowUsed)
      setToken(null)
      if (nowUsed >= (json.limit ?? QUESTION_LIMIT)) setBlocked('limit')
    } catch {
      setError(L.genericError)
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const counter = messages.length === 0 && used === 0
    ? null
    : L.counter(Math.min(used + (loading ? 1 : 0), QUESTION_LIMIT), QUESTION_LIMIT)

  return (
    <div className="max-w-3xl mx-auto">
    <div className="mb-6 text-center">
      <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 leading-snug">{L.title}</h1>
      <p className="text-sm text-zinc-500 max-w-xl mx-auto leading-relaxed">{L.subtitle}</p>
    </div>
    <div className="flex flex-col h-[calc(100vh-260px)] min-h-[480px]
                    border border-zinc-200 rounded-2xl overflow-hidden bg-white">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                          text-xs font-bold text-white shrink-0">T</div>
          <h2 className="text-sm font-bold text-zinc-900 truncate">TAIME Executive Advisor</h2>
        </div>
        {counter && (
          <span className="text-xs font-medium text-zinc-400 tabular-nums whitespace-nowrap">{counter}</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-zinc-50">
        {messages.length === 0 && !loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                            text-xs font-bold text-white shrink-0">T</div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                            bg-white border border-zinc-200 text-zinc-800 shadow-sm">
              {L.subtitle}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
              ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-taime-600 text-white'}`}>
              {msg.role === 'user' ? 'V' : 'T'}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-zinc-800 text-white rounded-tr-sm'
                : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'}`}>
              {msg.role === 'user'
                ? msg.content
                : <AdvisorMarkdown content={msg.content} />}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                            text-xs font-bold text-white shrink-0">T</div>
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer / bloqueio */}
      <div className="border-t border-zinc-100 bg-white px-5 py-4">
        {blocked ? (
          <div className="rounded-xl bg-taime-50 border border-taime-100 px-4 py-4 text-center">
            <p className="text-sm font-semibold text-zinc-900 mb-1">
              {blocked === 'ip' ? L.ipTitle : L.limitTitle}
            </p>
            <p className="text-sm text-zinc-600 mb-4">
              {blocked === 'ip' ? L.ipBody : L.limitBody}
            </p>
            <Link href="/login" className="btn-primary px-5 py-2.5 text-sm inline-flex justify-center">
              {L.limitCta} →
            </Link>
          </div>
        ) : !siteKey ? (
          <p className="text-sm text-zinc-500 text-center py-2">{L.unavailable}</p>
        ) : (
          <>
            {needsCaptcha && (
              <div className="mb-3 flex flex-col items-center gap-2">
                <div ref={captchaRef} />
                {!token && <p className="text-xs text-zinc-400">{L.captchaWait}</p>}
              </div>
            )}
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={L.placeholder}
                rows={2}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-2.5 text-sm
                           text-zinc-900 placeholder:text-zinc-400 outline-none
                           focus:ring-2 focus:ring-taime-600 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim() || (needsCaptcha && !token)}
                className="btn-primary px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                {loading ? L.sending : L.send}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 text-center">{L.note}</p>
          </>
        )}
      </div>
    </div>
    </div>
  )
}
