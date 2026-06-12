'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render markdown vindo do Advisor, estilizado com o design system do site.
 * Não habilita rehype-raw: HTML cru do modelo é escapado por padrão.
 */
export default function AdvisorMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-zinc-800 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-taime-700 underline underline-offset-2 hover:text-taime-800">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-200 pl-3 my-2 text-zinc-600 italic">
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
