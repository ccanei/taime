'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import type { CompanyFact } from '@/lib/company-facts'

// Resumo de fatos no painel lateral do Advisor: uma linha ("N fatos capturados") +
// os 2 mais recentes, SEM listar tudo nem editar. A lista completa com toggle e adicao
// vive na aba unificada /dashboard/empresa (secao Fatos). Mesmo endpoint /api/advisor/facts
// (um fetch por tipo), so um render diferente. Some quando nao ha fatos ativos.
export default function CompanyFactsSummary({ isPt }: { isPt: boolean }) {
  const [facts, setFacts]   = useState<CompanyFact[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/advisor/facts')
      .then(r => (r.ok ? r.json() : { facts: [] }))
      .then((d: { facts?: CompanyFact[] }) => { if (alive) { setFacts(d.facts ?? []); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  const active = facts.filter(f => f.is_active)
  if (!loaded || active.length === 0) return null

  const count = active.length
  const recent = active.slice(-2).reverse()
  const countLabel = isPt
    ? `${count} ${count === 1 ? 'fato capturado' : 'fatos capturados'}`
    : `${count} ${count === 1 ? 'fact captured' : 'facts captured'}`

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-600 mb-2.5">
        {isPt ? 'Fatos da empresa' : 'Company facts'}
      </h3>
      <Link href="/dashboard/empresa" className="group block">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 group-hover:text-taime-700 transition-colors">
          <ListChecks size={14} className="text-taime-600" />
          {countLabel}
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {recent.map(f => (
            <li key={f.id} className="text-[12px] text-zinc-500 leading-snug line-clamp-1">{f.fact}</li>
          ))}
        </ul>
        <span className="mt-2 inline-block text-[11px] font-semibold text-taime-600 group-hover:text-taime-800">
          {isPt ? 'Ver e editar todos →' : 'View and edit all →'}
        </span>
      </Link>
    </section>
  )
}
