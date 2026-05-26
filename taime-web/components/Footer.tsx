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
            <a href="mailto:contact@taime.tech"
              className="text-sm text-white/50 hover:text-white transition-colors">
              contact@taime.tech
            </a>
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
