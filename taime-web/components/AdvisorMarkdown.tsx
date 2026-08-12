'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render das respostas do Advisor com a identidade visual TAIME (cor de marca
 * taime-600 do design system). So CSS/render, zero mudanca de conteudo: aplica-se
 * retroativamente a conversas antigas.
 *
 * Blocos de topo (separados por linha em branco) assinam visualmente sem andaime:
 *  - Veredito de abertura: 1o bloco que abre em negrito ganha barra de marca +
 *    fundo levissimo + tipografia levemente maior (respostas de decisao).
 *  - Pergunta final: ultimo bloco terminando em "?" ganha respiro, italico e a
 *    mesma barrinha.
 *  - Citacoes (blockquote) e links de relatorio: barra/chip da cor de marca.
 *
 * Chip de citacao curto: o texto de um link de relatorio com titulo longo (> ~30
 * chars) e trocado, no render, pelo PERIODO curto (jun/2026 ↗). O titulo completo
 * vai para o atributo title (hover). Fonte do periodo, em ordem: (a) padrao
 * mmm/aaaa adjacente ao link (e o parenteses duplicado e suprimido); (b) padrao
 * dentro do proprio texto do link; (c) fallback: trunca o texto em ~30 chars.
 */

const isReportLink = (href: string) =>
  /\/(?:reports?|r)\//i.test(href) || href.includes('#trend-')

// Meses PT/EN (nomes cheios primeiro para consumir o token inteiro no match).
const MONTHS_RE =
  'janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|' +
  'january|february|march|april|june|july|august|september|october|november|december|' +
  'jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sept|sep|out|oct|nov|dez|dec'
// "jun/2026", "June 2026", "jun. 2026" ou "06/2026".
const PERIOD_STR = `(?:(?:${MONTHS_RE})\\.?[\\s/]+\\d{4}|\\d{1,2}/\\d{4})`

const MONTH_IDX: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7,
  aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
}
const MMM = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Normaliza um trecho de periodo para o formato curto "mmm/aaaa" (pt). Se nao
// reconhecer, devolve o trecho original aparado.
function toShortPeriod(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const num = s.match(/\b(\d{1,2})\/(\d{4})\b/)
  if (num) { const mo = Number(num[1]); if (mo >= 1 && mo <= 12) return `${MMM[mo]}/${num[2]}` }
  const named = s.match(/\b([a-z]{3,})[a-z.]*[\s/]+(\d{4})\b/)
  if (named) { const idx = MONTH_IDX[named[1].slice(0, 3)]; if (idx) return `${MMM[idx]}/${named[2]}` }
  return raw.trim()
}

// Encurta o texto exibido dos links de relatorio ANTES do parse. Move o titulo
// completo para o atributo title do link (hover). Deixa links comuns intactos.
function shortenReportLinks(md: string): string {
  const linkRe = new RegExp(
    `\\[([^\\]]*)\\]\\(([^)\\s"]+)(?:\\s+"([^"]*)")?\\)(\\s*[(,]?\\s*(${PERIOD_STR})\\)?)?`,
    'gi',
  )
  return md.replace(linkRe, (m, text: string, url: string, existingTitle: string | undefined, _adj: string | undefined, adjPeriod: string | undefined) => {
    if (!isReportLink(url)) return m
    let label: string
    if (adjPeriod) {
      label = toShortPeriod(adjPeriod)            // (a) periodo adjacente; suprime o parenteses
    } else if (text.length > 30) {
      const inText = text.match(new RegExp(PERIOD_STR, 'i'))
      label = inText ? toShortPeriod(inText[0])   // (b) periodo dentro do texto
                     : `${text.slice(0, 29).replace(/\s+\S*$/, '').trim() || text.slice(0, 29).trim()}…` // (c) trunca
    } else {
      return m                                    // curto o bastante: mantem
    }
    const full = (existingTitle || text).replace(/"/g, '\'').replace(/\s+/g, ' ').trim()
    return `[${label}](${url} "${full}")`
  })
}

// Colapsa chips de citacao identicos e adjacentes (mesmo report + trend, isto e,
// mesma ancora e mesmo rotulo) num unico chip. Roda depois do encurtamento, quando
// os tokens ja estao normalizados para o periodo curto. Trends distintas (rank
// diferente -> URL diferente) nao colapsam.
function collapseAdjacentDupLinks(md: string): string {
  return md.replace(
    /(\[[^\]]*\]\(\/reports\/[^)]*#trend-\d+[^)]*\))(?:[\s,;·]+\1)+/g,
    '$1',
  )
}

// Renderer do link, parametrizado pelo mapa de citacao: quando o chip nao tem titulo
// no markdown (o Advisor emite so o periodo), o titulo completo da trend vem do mapa
// e vira o tooltip (atributo title). Trends: report_id + rank derivados da ancora.
function makeAnchor(citations?: Record<string, string>): Components['a'] {
  return ({ href, title, children }) => {
    const url = typeof href === 'string' ? href : ''
    if (url && isReportLink(url)) {
      let hover = typeof title === 'string' && title ? title : undefined
      if (!hover && citations) {
        const m = url.match(/\/reports\/([^#?]+)#trend-(\d+)/)
        if (m) hover = citations[`${m[1]}#trend-${m[2]}`]
      }
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" title={hover}
           className="inline-flex items-baseline gap-0.5 rounded-md bg-taime-50 border border-taime-100
                      px-1.5 py-0.5 text-[0.82em] font-medium text-taime-700 no-underline align-baseline
                      whitespace-nowrap hover:bg-taime-100 transition-colors">
          {children}<span aria-hidden className="text-[0.9em] leading-none">↗</span>
        </a>
      )
    }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title={title}
         className="text-taime-700 font-medium underline decoration-dotted decoration-taime-300
                    underline-offset-2 hover:decoration-taime-500 hover:text-taime-800">
        {children}
      </a>
    )
  }
}

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

export default function AdvisorMarkdown({ content, citations }: { content: string; citations?: Record<string, string> }) {
  const blocks = splitBlocks(content)
  const components = useMemo<Components>(() => ({ ...COMPONENTS, a: makeAnchor(citations) }), [citations])

  return (
    <div className="text-sm leading-[1.65] text-zinc-800 break-words max-w-[70ch]">
      {blocks.map((raw, i) => {
        const block     = collapseAdjacentDupLinks(shortenReportLinks(raw))
        const isFirst   = i === 0
        const isLast    = i === blocks.length - 1
        const isQuote   = /^\s*>/.test(block)
        const opensBold = /^\s*\*\*\S/.test(block)          // abre em negrito -> tese
        const endsQ     = /\?["')\]]*\s*$/.test(block)      // termina em pergunta

        const verdict  = isFirst && opensBold && !isQuote
        const question = isLast && endsQ && !isQuote && !verdict

        const wrap = verdict
          ? 'border-l-[3px] border-taime-600 bg-taime-600/[0.05] rounded-r pl-3.5 pr-3 py-2 text-[15px] text-zinc-900'
          : question
            ? 'border-l-[3px] border-taime-600 pl-3.5 pr-1 py-1 mt-5 italic text-zinc-600'
            : ''

        return (
          <div key={i} className={`${isLast ? '' : 'mb-3.5'} ${wrap}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {block}
            </ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}
