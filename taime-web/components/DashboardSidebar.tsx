'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Radar, TrendingUp, FileText, MessageSquare, SquareCheck, Building2, Menu, X } from 'lucide-react'

// Sidebar de navegacao do dashboard logado. Desktop: fixa a esquerda (w-60). Mobile:
// drawer deslizante aberto por um botao hamburguer. Client component (estado do drawer
// + rota ativa via usePathname). Nao altera dados nem logica: so navegacao/layout.

interface NavItem { key: string; labelPt: string; labelEn: string; href: string; icon: typeof Home }

const NAV: NavItem[] = [
  { key: 'inicio',    labelPt: 'Início',            labelEn: 'Home',              href: '/dashboard',             icon: Home },
  { key: 'radar',     labelPt: 'Radar',             labelEn: 'Radar',             href: '/radar',                 icon: Radar },
  { key: 'tendencias', labelPt: 'Tendências',       labelEn: 'Trends',            href: '/dashboard#tendencias',  icon: TrendingUp },
  { key: 'relatorios', labelPt: 'Relatórios',       labelEn: 'Reports',           href: '/dashboard#arquivo',     icon: FileText },
  { key: 'advisor',   labelPt: 'Executive Advisor', labelEn: 'Executive Advisor', href: '/dashboard/advisor',     icon: MessageSquare },
  { key: 'decision',  labelPt: 'Decision Check',    labelEn: 'Decision Check',    href: '/decision-check',        icon: SquareCheck },
  { key: 'empresa',   labelPt: 'Minha Organização', labelEn: 'My Organization',   href: '/dashboard/empresa',     icon: Building2 },
]

function isActive(pathname: string, href: string): boolean {
  const base = href.split('#')[0]
  if (href.includes('#')) return false // ancoras (Tendencias/Relatorios) nao marcam ativo
  if (base === '/dashboard') return pathname === '/dashboard'
  return pathname === base || pathname.startsWith(base + '/')
}

export default function DashboardSidebar({ isEn }: { isEn: boolean }) {
  const pathname = usePathname() ?? '/dashboard'
  const [open, setOpen] = useState(false)

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ key, labelPt, labelEn, href, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
              ${active ? 'bg-taime-50 text-taime-700 ring-1 ring-taime-100' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'}`}
          >
            <Icon size={18} className={active ? 'text-taime-600' : 'text-zinc-400'} />
            <span className="truncate">{isEn ? labelEn : labelPt}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* ── Desktop: sidebar fixa ─────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:z-30
                        bg-white border-r border-zinc-200">
        <Link href="/" className="flex items-center h-16 px-6 border-b border-zinc-100 shrink-0">
          <span className="font-bold text-xl tracking-tight text-zinc-900">TAIME</span>
        </Link>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <div className="p-3 border-t border-zinc-100">
          <Link href="/conta" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
            {isEn ? 'My Account' : 'Minha Conta'}
          </Link>
        </div>
      </aside>

      {/* ── Mobile: hamburguer + drawer ───────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label={isEn ? 'Open menu' : 'Abrir menu'}
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-600 hover:bg-zinc-100 transition-colors"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-zinc-100 shrink-0">
              <Link href="/" onClick={() => setOpen(false)} className="font-bold text-xl tracking-tight text-zinc-900">TAIME</Link>
              <button onClick={() => setOpen(false)} aria-label={isEn ? 'Close menu' : 'Fechar menu'}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:bg-zinc-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <div className="p-3 border-t border-zinc-100">
              <Link href="/conta" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                {isEn ? 'My Account' : 'Minha Conta'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
