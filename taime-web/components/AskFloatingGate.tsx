'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import AskFloatingButton from '@/components/AskFloatingButton'

// Rotas publicas onde a pill aparece: home, preview de relatorio (/r/[id]) e login.
// Allowlist (nao denylist): so mostra onde foi autorizado, nunca em /ask, /dashboard,
// /admin ou qualquer rota autenticada.
function isAllowedPath(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/login') return true
  if (pathname === '/r' || pathname.startsWith('/r/')) return true
  return false
}

export default function AskFloatingGate() {
  const pathname = usePathname()
  // Monta oculto e so aparece apos confirmar rota permitida E ausencia de sessao,
  // para nunca dar flash da pill a um usuario logado.
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    setShow(false)
    if (!pathname || !isAllowedPath(pathname)) return

    createSupabaseBrowser().auth.getUser().then(({ data }) => {
      if (!cancelled && !data.user) setShow(true)
    })
    return () => { cancelled = true }
  }, [pathname])

  if (!show) return null
  return <AskFloatingButton />
}
