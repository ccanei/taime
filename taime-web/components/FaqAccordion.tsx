'use client'

import { useState } from 'react'

interface FaqItem { q: string; a: string }

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {items.map(({ q, a }, i) => (
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
            ${open === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            <p className="px-6 pb-5 text-sm text-zinc-500 leading-relaxed">{a}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
