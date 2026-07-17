import Link from 'next/link'

// Tela educada quando o assinante abre muitos reports completos em pouco tempo
// (teto de leitura por conta). Nao quebra a sessao: e so um aviso com saida clara.
export default function ReportRateLimited({ isPt }: { isPt: boolean }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 px-8 py-10 text-center">
        <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-taime-50 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
               strokeLinejoin="round" className="text-taime-600">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-zinc-900 mb-2">
          {isPt ? 'Você abriu muitos relatórios em pouco tempo' : 'You opened too many reports in a short time'}
        </h1>
        <p className="text-sm text-zinc-500 leading-relaxed mb-6">
          {isPt
            ? 'Para preservar o conteúdo, limitamos a quantidade de aberturas por hora. Aguarde alguns minutos e tente novamente. Sua conta continua ativa.'
            : 'To protect the content, we limit how many reports can be opened per hour. Please wait a few minutes and try again. Your account remains active.'}
        </p>
        <Link href="/dashboard" className="btn-secondary">
          {isPt ? 'Voltar ao painel' : 'Back to dashboard'}
        </Link>
      </div>
    </div>
  )
}
