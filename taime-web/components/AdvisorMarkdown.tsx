'use client'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render das respostas do Advisor com a identidade visual TAIME (cor de marca
 * taime-600 do design system). So CSS/render, zero mudanca de conteudo: aplica-se
 * retroativamente a conversas antigas.
 *
 * O texto e quebrado em BLOCOS de topo (separados por linha em branco) para
 * assinar visualmente sem andaime:
 *  - Veredito de abertura: 1o bloco que comeca em negrito ganha barra de marca +
 *    fundo levissimo + tipografia levemente maior. So aparece quando o modelo
 *    abriu com a tese em negrito (respostas de decisao); factuais/trajetoria que
 *    seguem o fluxo natural nao acionam nada.
 *  - Pergunta final: ultimo bloco terminando em "?" ganha respiro maior, italico
 *    e a mesma barrinha de marca (eco do veredito).
 *  - Citacoes (blockquote): barra de marca + fundo sutil; o link de periodo vira
 *    chip clicavel.
 *  - Links de relatorio: chip discreto; demais links, sublinhado pontilhado.
 */

const isReportLink = (href: string) =>
  /\/(?:reports?|r)\//i.test(href) || href.includes('#trend-')

const COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="text-sm font-bold text-zinc-900 mt-3 first:mt-0 mb-1.5">{children}</h3>,
  h2: ({ children }) => <h3 className="text-sm font-bold text-zinc-900 mt-3 first:mt-0 mb-1.5">{children}</h3>,
  h3: ({ children }) => <h4 className="text-sm font-semibold text-zinc-900 mt-3 first:mt-0 mb-1">{children}</h4>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-zinc-900 mt-2.5 first:mt-0 mb-1">{children}</h4>,
  p:  ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => {
    const url = typeof href === 'string' ? href : ''
    if (url && isReportLink(url)) {
      // Chip de citacao: pastilha da cor de marca, o link para a ancora da trend.
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-baseline gap-0.5 rounded-md bg-taime-50 border border-taime-100
                      px-1.5 py-0.5 text-[0.82em] font-medium text-taime-700 no-underline align-baseline
                      hover:bg-taime-100 transition-colors">
          {children}<span aria-hidden className="text-[0.9em] leading-none">↗</span>
        </a>
      )
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="text-taime-700 font-medium underline decoration-dotted decoration-taime-300
                    underline-offset-2 hover:decoration-taime-500 hover:text-taime-800">
        {children}
      </a>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-taime-600 bg-taime-50/60 rounded-r pl-3.5 pr-3 py-2 text-zinc-600">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className="block bg-zinc-900 text-zinc-100 rounded-lg p-3 my-2 text-xs
                         font-mono overflow-x-auto whitespace-pre">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-zinc-100 text-zinc-800 rounded px-1 py-0.5 text-[0.85em] font-mono">
        {children}
      </code>
    )
  },
  hr: () => <hr className="my-3 border-zinc-100" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 -mx-1">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-zinc-200">{children}</thead>,
  th: ({ children }) => <th className="text-left font-semibold text-zinc-700 px-2 py-1.5 whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 border-b border-zinc-100 align-top">{children}</td>,
}

// Quebra o texto em blocos de topo (paragrafos e citacoes) por linha em branco.
function splitBlocks(md: string): string[] {
  return md.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
}

export default function AdvisorMarkdown({ content }: { content: string }) {
  const blocks = splitBlocks(content)

  return (
    <div className="text-sm leading-[1.65] text-zinc-800 break-words max-w-[70ch]">
      {blocks.map((block, i) => {
        const isFirst   = i === 0
        const isLast    = i === blocks.length - 1
        const isQuote   = /^\s*>/.test(block)
        const opensBold = /^\s*\*\*\S/.test(block)          // abre em negrito -> tese
        const endsQ     = /\?["')\]]*\s*$/.test(block)      // termina em pergunta

        // Veredito: 1o bloco aberto em negrito (respostas de decisao).
        const verdict  = isFirst && opensBold && !isQuote
        // Pergunta final: ultimo bloco terminando em "?".
        const question = isLast && endsQ && !isQuote && !verdict

        const wrap = verdict
          ? 'border-l-[3px] border-taime-600 bg-taime-600/[0.05] rounded-r pl-3.5 pr-3 py-2 text-[15px] text-zinc-900'
          : question
            ? 'border-l-[3px] border-taime-600 pl-3.5 pr-1 py-1 mt-5 italic text-zinc-600'
            : ''

        return (
          <div key={i} className={`${isLast ? '' : 'mb-3.5'} ${wrap}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
              {block}
            </ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}
