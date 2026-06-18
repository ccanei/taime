'use client'

// Fonte única do menu de navegação do admin.
// Qualquer página nova em /admin/* deve renderizar este componente
// no header, em vez de duplicar links no JSX local.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminLink {
  href:  string
  label: string
}

const ADMIN_LINKS: AdminLink[] = [
  { href: '/admin/waitlist',   label: 'Waitlist'   },
  { href: '/admin/reports',    label: 'Reports'    },
  { href: '/admin/feedback',   label: 'Feedback'   },
  { href: '/admin/newsletter', label: 'Newsletter' },
  { href: '/admin/engagement', label: 'Engagement' },
]

export default function AdminNav({ active }: { active?: string }) {
  const pathname = usePathname()
  const current  = active ?? pathname ?? ''

  return (
    <nav className="flex items-center gap-3 ml-4 text-xs text-zinc-400">
      {ADMIN_LINKS.map((link, idx) => {
        const isActive = current === link.href || current.startsWith(link.href + '/')
        return (
          <span key={link.href} className="flex items-center gap-3">
            {idx > 0 && <span className="text-zinc-200">·</span>}
            <Link
              href={link.href}
              className={
                isActive
                  ? 'text-zinc-900 font-semibold'
                  : 'hover:text-zinc-700 transition-colors'
              }
            >
              {link.label}
            </Link>
          </span>
        )
      })}
    </nav>
  )
}
