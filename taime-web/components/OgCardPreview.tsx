'use client'

import { useState } from 'react'

// Previa visual do Report Card compartilhavel (imagem gerada por /api/og/...).
// Proporcao fixa 1200x630 (aspect-ratio reserva o espaco, sem layout shift), com
// skeleton shimmer enquanto carrega (a geracao leva ate ~1.5s). Clique abre a
// imagem em tamanho real numa nova aba. loading=lazy. Fundo escuro (pagina dark).
export default function OgCardPreview({
  src, label, openLabel, alt,
}: {
  src: string
  label: string
  openLabel: string
  alt: string
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="mb-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 mb-3">{label}</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        title={openLabel}
        className="group relative block w-full max-w-[560px] rounded-2xl overflow-hidden
                   ring-1 ring-white/12 shadow-2xl shadow-black/40 bg-white/[0.03]"
        style={{ aspectRatio: '1200 / 630' }}
      >
        {!loaded && (
          <span aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-white/[0.02] taime-shimmer" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={1200}
          height={630}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* overlay de "abrir" no hover */}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg
                         bg-black/55 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-semibold text-white/90
                         opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
          {openLabel}
        </span>
      </a>
      <style>{`
        @keyframes taime-shimmer-kf { 0% { background-position: -320px 0 } 100% { background-position: 320px 0 } }
        .taime-shimmer { background-image: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.07) 50%, transparent 80%); background-size: 320px 100%; background-repeat: no-repeat; animation: taime-shimmer-kf 1.3s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .taime-shimmer { animation: none } }
      `}</style>
    </div>
  )
}
