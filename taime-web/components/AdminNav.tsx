'use client'

// Fonte única do menu de navegação do admin.
// Qualquer página nova em /admin/* deve renderizar este componente
// no header, em vez de duplicar links no JSX local.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface AdminLink {
  href:  string
  label: string
  badge?: 'reports' | 'waitlist' // chave do contador para o badge
}

const ADMIN_LINKS: AdminLink[] = [
  { href: '/admin',            label: 'Cockpit'    },
  { href: '/admin/waitlist',   label: 'Waitlist',   badge: 'waitlist' },
  { href: '/admin/users',      label: 'Users'      },
  { href: '/admin/reports',    label: 'Reports',    badge: 'reports' },
  { href: '/admin/feedback',   label: 'Feedback'   },
  { href: '/admin/newsletter', label: 'Newsletter' },
  { href: '/admin/engagement', label: 'Engagement' },
  { href: '/admin/telemetry',  label: 'Telemetry'  },
  { href: '/admin/posts',      label: 'Posts'      },
]

// '/admin' so casa exatamente; os demais casam o proprio caminho e subrotas.
function matchActive(current: string, href: string): boolean {
  if (href === '/admin') return current === '/admin'
  return current === href || current.startsWith(href + '/')
}

export default function AdminNav({ active }: { active?: string }) {
  const pathname = usePathname()
  const current  = active ?? pathname ?? ''
  const [counts, setCounts] = useState<{ reports: number; waitlist: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/nav-counts')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j) setCounts({ reports: j.reports ?? 0, waitlist: j.waitlist ?? 0 }) })
      .catch(() => { /* badges sao opcionais */ })
    return () => { alive = false }
  }, [])

  return (
    <nav className="flex items-center gap-3 ml-4 text-xs text-zinc-400">
      {ADMIN_LINKS.map((link, idx) => {
        const isActive = matchActive(current, link.href)
        const count = link.badge && counts ? counts[link.badge] : 0
        return (
          <span key={link.href} className="flex items-center gap-3">
            {idx > 0 && <span className="text-zinc-200">·</span>}
            <Link
              href={link.href}
              className={
                'relative inline-flex items-center gap-1.5 pb-0.5 transition-colors ' +
                (isActive
                  ? 'text-taime-700 font-semibold border-b-2 border-taime-500'
                  : 'hover:text-zinc-700 border-b-2 border-transparent')
              }
            >
              {link.label}
              {count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold tabular-nums leading-none">
                  {count}
                </span>
              )}
            </Link>
          </span>
        )
      })}
    </nav>
  )
}
