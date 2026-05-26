'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'
import LanguageSelector from './LanguageSelector'

export default function Navbar() {
  const [open,     setOpen]     = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const { t } = useLocale()

  useEffect(() => {
    createSupabaseBrowser().auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user)
    })
  }, [])

  async function signOut() {
    await createSupabaseBrowser().auth.signOut()
    window.location.href = '/'
  }

  const NAV_LINKS = [
    { label: t.nav.howItWorks, href: '/#como-funciona' },
    { label: t.nav.plans,      href: '/planos'          },
    { label: t.nav.about,      href: '/sobre'           },
    { label: t.nav.contact,    href: '/contato'         },
  ]

  return (
    <nav className="border-b border-zinc-100 px-6 py-4 sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/taime-icon.svg" alt="TAIME" width={28} height={28} />
          <span className="font-bold text-xl tracking-tight text-zinc-900">TAIME</span>
        </Link>

        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-5">
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={href} href={href}
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
              {label}
            </Link>
          ))}

          <LanguageSelector />

          {loggedIn ? (
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
                {t.nav.reports}
              </Link>
              <button onClick={signOut} className="btn-secondary text-sm">
                {t.nav.signOut}
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-secondary text-sm">{t.nav.access}</Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(v => !v)}
          className="sm:hidden p-2 rounded-lg text-zinc-500 hover:text-zinc-900 transition-colors"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        >
          {open ? (
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-zinc-100 mt-4 pt-4 pb-3 px-2 space-y-1">
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-zinc-700 rounded-lg hover:bg-zinc-50">
              {label}
            </Link>
          ))}
          <div className="px-4 py-2">
            <LanguageSelector />
          </div>
          {loggedIn ? (
            <>
              <Link href="/dashboard" onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-zinc-700 rounded-lg hover:bg-zinc-50">
                {t.nav.reports}
              </Link>
              <div className="pt-2">
                <button onClick={signOut} className="btn-secondary w-full justify-center text-sm">
                  {t.nav.signOut}
                </button>
              </div>
            </>
          ) : (
            <div className="pt-2">
              <Link href="/login" className="btn-primary w-full justify-center text-sm">
                {t.nav.access}
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
