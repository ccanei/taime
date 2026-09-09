'use client'

import { useState } from 'react'

// Botao "Compartilhar": copia a URL atual (indexavel/compartilhavel). Client-only.
export default function DecisionShareButton({ label, copied }: { label: string; copied: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setDone(true); setTimeout(() => setDone(false), 1800)
    } catch { /* clipboard indisponivel */ }
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold
                 text-white/70 hover:text-white hover:border-white/30 transition-colors">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {done ? copied : label}
    </button>
  )
}
