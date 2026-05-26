'use client'

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { useLocale } from '@/lib/useLocale'

type Status = 'idle' | 'loading' | 'sent' | 'error'

export default function ContatoPage() {
  const { t } = useLocale()
  const c = t.contato

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<Status>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')

    try {
      const res  = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, message }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok || !json.ok) {
        setErrMsg(json.error ?? c.errGeneric)
        setStatus('error')
        return
      }

      setStatus('sent')
      setName(''); setEmail(''); setMessage('')
    } catch (err) {
      setErrMsg(String(err))
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="max-w-2xl mx-auto px-6 pt-24 pb-20">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          {c.badge}
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-4">
          {c.h1}
        </h1>
        <p className="text-zinc-500 text-base mb-10 leading-relaxed">
          {c.subtitle}
        </p>

        {/* Direct contacts */}
        <div className="flex flex-col sm:flex-row gap-4 mb-10">
          <a
            href="mailto:contact@taime.tech"
            className="inline-flex items-center gap-2 text-sm font-semibold text-taime-600
                       hover:text-taime-700 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            contact@taime.tech
          </a>
          <a
            href="https://www.linkedin.com/company/taime-tech"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-taime-600
                       hover:text-taime-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239
                       5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966
                       0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783
                       1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586
                       7-2.777 7 2.476v6.759z"/>
            </svg>
            {c.linkedinLabel}
          </a>
        </div>

        {/* Form */}
        {status === 'sent' ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-6 py-8 text-center">
            <svg className="mx-auto text-emerald-600 mb-4" width="32" height="32" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-base font-semibold text-emerald-800 mb-1">{c.successTitle}</p>
            <p className="text-sm text-emerald-700">{c.successBody}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                {c.nameLabel}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={c.namePlaceholder}
                className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm
                           text-zinc-900 placeholder-zinc-400 outline-none
                           focus:border-taime-500 focus:ring-2 focus:ring-taime-100 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                {c.emailLabel}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm
                           text-zinc-900 placeholder-zinc-400 outline-none
                           focus:border-taime-500 focus:ring-2 focus:ring-taime-100 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5">
                {c.msgLabel}
              </label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={c.msgPlaceholder}
                className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm
                           text-zinc-900 placeholder-zinc-400 outline-none resize-none
                           focus:border-taime-500 focus:ring-2 focus:ring-taime-100 transition-colors"
              />
            </div>

            {status === 'error' && errMsg && (
              <p className="text-sm text-red-600">{errMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? c.submitting : c.submitBtn}
            </button>
          </form>
        )}
      </section>

      <Footer />
    </div>
  )
}
