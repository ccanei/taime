'use client'

import { useEffect, useState } from 'react'

// Marca d'agua por usuario para report de conteudo INTEGRAL de assinante logado.
// Nunca renderizada em pagina publica (sample /r) nem em preview: o server so
// passa o email quando o assinante ve o conteudo completo.
//
// Camadas:
//  1. Overlay diagonal sutil na tela (email repetido, opacity baixissima,
//     pointer-events none: nao atrapalha leitura nem interacao).
//  2. Na impressao (@media print, ver globals.css): o overlay fica mais visivel e
//     aparecem bandas carimbadas de cabecalho/rodape em cada pagina.
// Objetivo: desencorajar e rastrear redistribuicao, sem punir quem paga.

export default function ReportWatermark({ email, isPt }: { email: string; isPt: boolean }) {
  // Data so no cliente, para nao dar mismatch de hidratacao (a impressao acontece
  // sempre depois da pagina montar).
  const [date, setDate] = useState('')
  useEffect(() => {
    setDate(new Date().toLocaleDateString(isPt ? 'pt-BR' : 'en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
    }))
  }, [isPt])

  // Remove caracteres que quebrariam o XML do SVG (email normal nao os tem).
  const safe = email.replace(/[<>&"']/g, '')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300">` +
    `<text x="18" y="150" fill="#111111" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="15" transform="rotate(-28 230 150)">${safe}</text></svg>`
  const bg = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

  const band = isPt
    ? `Conteúdo licenciado para ${safe} · TAIME · Redistribuição proibida${date ? ` · ${date}` : ''}`
    : `Content licensed to ${safe} · TAIME · Redistribution prohibited${date ? ` · ${date}` : ''}`

  return (
    <>
      {/* Overlay de tela (sutil) e impressao (reforcado via CSS .wm-layer) */}
      <div
        aria-hidden
        className="wm-layer pointer-events-none fixed inset-0 z-[5] select-none"
        style={{ backgroundImage: bg, backgroundRepeat: 'repeat', opacity: 0.04 }}
      />
      {/* Bandas carimbadas: so aparecem na impressao (ver .wm-print-band no CSS) */}
      <div aria-hidden className="wm-print-band wm-print-band-top">{band}</div>
      <div aria-hidden className="wm-print-band wm-print-band-bottom">{band}</div>
    </>
  )
}
