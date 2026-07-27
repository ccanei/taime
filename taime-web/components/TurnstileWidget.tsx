'use client'

import { useEffect, useRef } from 'react'

// Widget do Cloudflare Turnstile (mesma infra do /ask), reutilizavel no funil de
// cadastro. Carrega o script uma vez e renderiza explicitamente. Chama onToken
// com o token (ou null quando expira/erra). Sem siteKey, nao renderiza nada.
type TurnstileApi = {
  render: (el: HTMLElement, opts: {
    sitekey: string
    callback: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
    theme?: 'light' | 'dark' | 'auto'
  }) => string
  reset: (id?: string) => void
}
function ts(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile
}

export default function TurnstileWidget({
  siteKey, onToken,
}: {
  siteKey: string | null
  onToken: (token: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rendered = useRef(false)

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    function render() {
      if (cancelled || rendered.current) return
      const api = ts()
      if (api && ref.current) {
        rendered.current = true
        api.render(ref.current, {
          sitekey: siteKey!,
          theme:   'light',
          callback: (t: string) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback':   () => onToken(null),
        })
      }
    }

    if (ts()) {
      render()
    } else {
      const existing = document.querySelector('script[data-turnstile]')
      if (!existing) {
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', 'true')
        s.onload = render
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', render)
      }
      const poll = setInterval(() => { if (ts()) { render(); clearInterval(poll) } }, 300)
      setTimeout(() => clearInterval(poll), 15000)
    }
    return () => { cancelled = true }
  }, [siteKey, onToken])

  if (!siteKey) return null
  return <div ref={ref} className="my-1" />
}
