'use client'

import { useState } from 'react'
import { useLocale } from '@/lib/useLocale'

type Status = 'idle' | 'loading' | 'sent' | 'error'

export default function NewsletterSignup({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const { t, locale } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'

  const [email,   setEmail]   = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [status,  setStatus]  = useState<Status>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  const labels = isPt
    ? {
        title:       'Receba o resumo semanal do TAIME',
        sub:         'Um resumo semanal dos sinais de tecnologia, sintetizado por tema. Toda segunda de manhã, sem ruído.',
        placeholder: 'seu@email.com',
        cta:         'Inscrever',
        loading:     'Enviando...',
        ok:          'Inscrição confirmada. Você receberá o próximo resumo semanal.',
        err:         'Não conseguimos te inscrever. Tente novamente.',
        emailErr:    'Informe um email válido.',
      }
    : {
        title:       'Get the weekly TAIME digest',
        sub:         'A weekly digest of technology signals, synthesized by theme. Every Monday morning, no noise.',
        placeholder: 'you@email.com',
        cta:         'Subscribe',
        loading:     'Sending...',
        ok:          "You're subscribed. The next weekly digest is on its way.",
        err:         "We couldn't sign you up. Try again.",
        emailErr:    'Enter a valid email.',
      }

  const dark = variant === 'dark'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setErrMsg(labels.emailErr); setStatus('error'); return
    }
    setStatus('loading'); setErrMsg('')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), website, locale }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setErrMsg(data.error ?? labels.err)
        setStatus('error'); return
      }
      setStatus('sent')
      setEmail('')
    } catch {
      setErrMsg(labels.err); setStatus('error')
    }
  }

  return (
    <div
      className={
        dark
          ? 'rounded-2xl bg-taime-900 text-white p-8'
          : 'rounded-2xl bg-zinc-50 border border-zinc-200 text-zinc-900 p-8'
      }
    >
      <h3 className={`text-xl sm:text-2xl font-bold mb-2 leading-snug ${dark ? 'text-white' : 'text-zinc-900'}`}>
        {labels.title}
      </h3>
      <p className={`text-sm mb-6 leading-relaxed ${dark ? 'text-white/60' : 'text-zinc-500'}`}>
        {labels.sub}
      </p>

      {status === 'sent' ? (
        <p className={`text-sm font-medium ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>
          {labels.ok}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          {/* Honeypot anti-bot, escondido para humanos */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
          >
            <label htmlFor="nl-website">Website</label>
            <input
              id="nl-website"
              type="text"
              name="website"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={labels.placeholder}
            disabled={status === 'loading'}
            className={
              dark
                ? 'flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-60'
                : 'flex-1 px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-taime-600 disabled:opacity-60'
            }
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className={
              dark
                ? 'px-6 py-3 rounded-lg bg-white text-taime-900 text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
                : 'btn-primary text-sm px-6 py-3 disabled:opacity-60 disabled:cursor-not-allowed'
            }
          >
            {status === 'loading' ? labels.loading : labels.cta}
          </button>
        </form>
      )}

      {status === 'error' && errMsg && (
        <p className={`mt-3 text-sm ${dark ? 'text-red-300' : 'text-red-600'}`}>{errMsg}</p>
      )}
    </div>
  )
}
