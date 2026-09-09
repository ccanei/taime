'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

export default function Footer() {
  const { locale, t } = useLocale()
  const h    = t.home
  const year = new Date().getFullYear()

  return (
    <footer className="bg-taime-900">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-12">
          <div className="sm:col-span-2">
            <div className="font-bold text-2xl tracking-tight text-white mb-3">TAIME</div>
            <p className="text-sm text-white/50 leading-relaxed max-w-sm mb-4">{h.footerDesc}</p>
            <div className="flex items-center gap-3">
              <a href="mailto:contact@taime.tech"
                className="text-sm text-white/50 hover:text-white transition-colors">
                contact@taime.tech
              </a>
              <a
                href="https://www.linkedin.com/company/taime-tech"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.nav.linkedin}
                title={t.nav.linkedin}
                className="text-white/50 hover:text-taime-400 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-white/30 mb-4 uppercase">
              {h.footerNavLabel}
            </p>
            <ul className="space-y-2">
              {h.footerLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-white/50 hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-8 text-center text-xs text-white/30">
          {h.footerCopyright(year)}
        </div>
      </div>
    </footer>
  )
}
