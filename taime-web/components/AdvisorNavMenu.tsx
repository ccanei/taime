'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { DASHBOARD_NAV } from '@/lib/dashboard-nav'

// Menu colapsavel (popover) no header do Advisor: caminho adicional para as areas do
// TAIME, sem ocupar espaco fixo. Reusa DASHBOARD_NAV (mesma fonte da sidebar). Fecha ao
// clicar fora ou ao selecionar. NAO remove nenhuma navegacao existente. So no Advisor
// LOGADO (o /ask anonimo nao navega para o dashboard, entao nao recebe este menu).

// No Advisor ja estamos no Executive Advisor, entao esse item sai do menu.
const ITEMS = DASHBOARD_NAV.filter(i => i.key !== 'advisor')

export default function AdvisorNavMenu({ isPt }: { isPt: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isPt ? 'Navegar no TAIME' : 'Navigate TAIME'}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-taime-700 hover:bg-zinc-100 transition-colors"
      >
        <LayoutGrid size={18} />
      </button>
      {open && (
        <div role="menu"
          className="absolute left-0 top-full mt-1.5 z-40 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg p-1.5">
          <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            {isPt ? 'Navegar' : 'Navigate'}
          </p>
          {ITEMS.map(({ key, labelPt, labelEn, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-taime-700 transition-colors"
            >
              <Icon size={16} className="text-zinc-400" />
              {isPt ? labelPt : labelEn}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
