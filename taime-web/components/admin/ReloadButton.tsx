'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

// Botao de recarregar padrao do cockpit (sem auto-refresh). router.refresh()
// re-executa o server component e traz os dados novos sem full reload.
export default function ReloadButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [spin, setSpin] = useState(false)

  function onClick() {
    setSpin(true)
    startTransition(() => {
      router.refresh()
      setTimeout(() => setSpin(false), 600)
    })
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600
                 hover:border-taime-200 hover:text-taime-700 transition-colors disabled:opacity-50"
    >
      <span className={spin ? 'inline-block animate-spin' : 'inline-block'}>↻</span> Recarregar
    </button>
  )
}
