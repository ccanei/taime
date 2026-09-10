// Botao "Baixar imagem": ancora same-origin para o endpoint de Report Card, com o
// atributo download (forca o download do PNG). Sem estado, serve em server e client.
// variant: dark (fundo azul-marinho do /decision-check e /r) ou light.

export default function OgDownloadButton({
  href, label, variant = 'dark',
}: {
  href: string
  label: string
  variant?: 'dark' | 'light'
}) {
  const cls = variant === 'dark'
    ? 'border-white/15 text-white/70 hover:text-white hover:border-white/30'
    : 'border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400'
  return (
    <a
      href={href}
      download
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${cls}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </a>
  )
}
