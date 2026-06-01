'use client'

import { useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { useLocale } from '@/lib/useLocale'

const FEATURE_VALUES: { free: boolean | string; essential: boolean | string; strategic: boolean | string }[] = [
  { free: true,  essential: true,  strategic: true  }, // Preview dos relatórios
  { free: true,  essential: true,  strategic: true  }, // TAIME Score geral
  { free: false, essential: true,  strategic: true  }, // Análise completa das trends
  { free: false, essential: true,  strategic: true  }, // Framework
  { free: false, essential: true,  strategic: true  }, // Score dimensions
  { free: false, essential: true,  strategic: true  }, // THEN / NOW / NEXT
  { free: false, essential: true,  strategic: true  }, // Implicações organizacionais
  { free: false, essential: true,  strategic: true  }, // Gatilhos de decisão
  { free: false, essential: true,  strategic: true  }, // Histórico 1 ano
  { free: false, essential: false, strategic: true  }, // Relatórios quinzenais
  { free: false, essential: false, strategic: true  }, // Histórico completo desde 2000
]

function Check({ val }: { val: boolean | string }) {
  if (val === false) return <span className="text-zinc-300 text-lg font-light">—</span>
  if (val === true)  return <span className="text-emerald-600 font-bold">✓</span>
  return <span className="text-sm text-zinc-700 font-medium">{val}</span>
}

export default function PlanosPage() {
  const { t } = useLocale()
  const p = t.planos
  const [open, setOpen] = useState<number | null>(null)

  const featureRows = FEATURE_VALUES.map((vals, i) => ({
    label: (p.featureLabels as readonly string[])[i] ?? '',
    ...vals,
  }))

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          {p.badge}
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 mb-4">
          {p.h1}
        </h1>
        <p className="text-zinc-500 text-base max-w-xl mx-auto">
          {p.subtitle}
        </p>
      </section>

      {/* ── CARDS DE PLANOS ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4">
          {p.planCards.map(({ name, price, desc, badge, highlight }) => (
            <div
              key={name}
              className={`relative rounded-2xl border p-6
                ${highlight
                  ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600'
                  : 'border-zinc-200 bg-white'
                }`}
            >
              {badge && (
                <span className="absolute -top-3 left-6 px-3 py-0.5 rounded-full text-[11px]
                                 font-bold bg-taime-600 text-white">
                  {badge}
                </span>
              )}
              <h2 className="text-lg font-bold text-zinc-900 mb-1">{name}</h2>
              <p className={`text-2xl font-bold tabular-nums mb-1
                ${highlight ? 'text-zinc-900' : 'text-zinc-600'}`}>
                {price}
              </p>
              <p className="text-sm text-zinc-500 mb-5">{desc}</p>
              <Link href="/login"
                className={highlight
                  ? 'btn-primary w-full justify-center py-3'
                  : 'btn-secondary w-full justify-center py-3'
                }>
                {p.planCtaBtn}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── TABELA COMPARATIVA ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {(p.tableHeaders as readonly string[]).map((h, i) => (
                    <th key={i}
                      className={`px-${i === 0 ? '6' : '4'} py-4 text-${i === 0 ? 'left' : 'center'} text-xs font-bold text-zinc-${i === 0 ? '400' : '700'} tracking-widest uppercase${i === 0 ? ' w-1/2' : ' whitespace-nowrap'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {featureRows.map(({ label, free, essential, strategic }) => (
                  <tr key={label} className="bg-white hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3.5 text-zinc-700 text-sm">{label}</td>
                    <td className="px-4 py-3.5 text-center"><Check val={free} /></td>
                    <td className="px-4 py-3.5 text-center"><Check val={essential} /></td>
                    <td className="px-4 py-3.5 text-center"><Check val={strategic} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ DE PLANOS ────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-4 uppercase">
            {p.faqLabel}
          </p>
          <h2 className="text-2xl font-bold text-zinc-900 mb-8">{p.faqTitle}</h2>

          <div className="space-y-2">
            {p.planFaq.map(({ q, a }, i) => (
              <div key={i} className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4
                             hover:bg-zinc-50 transition-colors"
                  aria-expanded={open === i}
                >
                  <span className="text-sm font-semibold text-zinc-900">{q}</span>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    strokeWidth={2.5}
                    className={`shrink-0 text-zinc-400 transition-transform duration-200
                      ${open === i ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-200 ease-in-out
                  ${open === i ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="px-6 pb-5 text-sm text-zinc-500 leading-relaxed">{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────────────── */}
      <section className="py-16 text-center">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">
            {p.finalCtaTitle}
          </h2>
          <p className="text-zinc-500 text-sm mb-8">
            {p.finalCtaBody}
          </p>
          <Link href="/login" className="btn-primary text-base px-8 py-3">
            {p.finalCtaBtn}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
