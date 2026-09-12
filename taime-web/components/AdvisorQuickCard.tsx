'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp } from 'lucide-react'

// Card ATIVO do Executive Advisor no dashboard: status "Pronto", preview da conversa em
// andamento (quando existe) com "Continuar", e um input REAL sempre visivel. Ao enviar,
// navega para /dashboard/advisor?ask=<q>&send=1, que a pagina do chat le e inicia a
// conversa automaticamente com a pergunta. Bloqueado (plano) mostra o CTA de planos.

export default function AdvisorQuickCard({
  isEn, unlocked, hasProfile, snippet, newBadge,
}: {
  isEn: boolean
  unlocked: boolean
  hasProfile: boolean
  snippet: string | null
  newBadge: boolean
}) {
  const router = useRouter()
  const [text, setText] = useState('')

  function submit() {
    const q = text.trim()
    if (!q) return
    router.push(`/dashboard/advisor?ask=${encodeURIComponent(q.slice(0, 500))}&send=1`)
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-taime-50 ring-1 ring-taime-100 flex items-center justify-center shrink-0">
          <span className="text-sm">🧠</span>
        </div>
        <h2 className="text-sm font-bold text-zinc-900">Executive Advisor</h2>
        {unlocked ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{isEn ? 'Ready' : 'Pronto'}
          </span>
        ) : (
          <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-500 tracking-wide">{isEn ? 'SOON' : 'EM BREVE'}</span>
        )}
        {unlocked && newBadge && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-taime-600 text-white tracking-wide">{isEn ? 'NEW' : 'NOVO'}</span>
        )}
      </div>

      {!unlocked ? (
        <>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">
            {isEn
              ? 'Strategic advisor with strategic memory across the TAIME archive and personalized context for your company.'
              : 'Consultor estratégico com memória estratégica do arquivo TAIME e contexto personalizado para a sua empresa.'}
          </p>
          <Link href="/planos" className="text-xs font-medium text-taime-600 hover:text-taime-800 inline-flex">
            {isEn ? 'Essential and Strategic plans →' : 'Planos Essential e Strategic →'}
          </Link>
        </>
      ) : (
        <>
          {/* Preview da conversa em andamento (quando ha), com continuar. */}
          {hasProfile && snippet && (
            <Link href="/dashboard/advisor"
              className="group block rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 mb-3 hover:border-taime-200 transition-colors">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">{isEn ? 'Ongoing conversation' : 'Conversa em andamento'}</p>
              <p className="text-xs text-zinc-500 leading-snug line-clamp-2">{snippet}</p>
              <span className="mt-1 inline-block text-[11px] font-semibold text-taime-600 group-hover:text-taime-800">
                {isEn ? 'Continue this conversation →' : 'Continuar esta conversa →'}
              </span>
            </Link>
          )}

          {/* Input real: sempre visivel. Enviar leva ao chat com a pergunta pre-carregada. */}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              rows={2}
              placeholder={isEn ? 'Ask something about your company...' : 'Pergunte algo sobre sua empresa...'}
              className="flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800
                         placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-taime-500 focus:border-transparent"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label={isEn ? 'Send' : 'Enviar'}
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-taime-600 text-white
                         hover:bg-taime-700 disabled:opacity-40 transition-colors"
            >
              <ArrowUp size={16} />
            </button>
          </div>
          {!hasProfile && (
            <Link href="/dashboard/advisor" className="mt-2 inline-block text-[11px] font-medium text-taime-600 hover:text-taime-800">
              {isEn ? 'Set up your Advisor →' : 'Configurar seu Advisor →'}
            </Link>
          )}
        </>
      )}
    </div>
  )
}
