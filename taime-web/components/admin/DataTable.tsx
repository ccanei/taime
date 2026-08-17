'use client'

import { useState, type ReactNode } from 'react'

export interface Column<T> {
  key:      string
  label:    string
  align?:   'left' | 'right' | 'center'
  sortable?: boolean
  // valor para ordenacao (numero ou string); default: row[key]
  sortValue?: (row: T) => number | string
  // render da celula; default: String(row[key])
  render?:  (row: T) => ReactNode
  width?:   string
}

// Tabela densa e escaneavel: cabecalho sticky, zebra sutil, ordenacao client-side
// barata. Os dados ja vem agregados/limitados do servidor (payload compacto).
export default function DataTable<T extends Record<string, unknown>>({
  columns, rows, initialSort, initialDir = 'desc', empty = 'Sem registros.',
}: {
  columns:     Column<T>[]
  rows:        T[]
  initialSort?: string
  initialDir?: 'asc' | 'desc'
  empty?:      string
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort ?? null)
  const [dir, setDir]         = useState<'asc' | 'desc'>(initialDir)

  const col = columns.find(c => c.key === sortKey)
  const sorted = col
    ? [...rows].sort((a, b) => {
        const va = col.sortValue ? col.sortValue(a) : (a[col.key] as number | string)
        const vb = col.sortValue ? col.sortValue(b) : (b[col.key] as number | string)
        let cmp = 0
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
        return dir === 'asc' ? cmp : -cmp
      })
    : rows

  function toggle(key: string) {
    if (sortKey === key) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setDir('desc') }
  }

  const alignCls = (a?: string) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400 py-8 text-center">{empty}</p>
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-zinc-200">
            {columns.map(c => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}
                  className={`py-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 ${alignCls(c.align)} ${c.sortable ? 'cursor-pointer select-none hover:text-zinc-700' : ''}`}
                  onClick={c.sortable ? () => toggle(c.key) : undefined}>
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.sortable && sortKey === c.key && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-taime-500">
                      <path d={dir === 'asc' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className={`border-b border-zinc-50 hover:bg-taime-50/40 transition-colors ${i % 2 ? 'bg-zinc-50/40' : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`py-2 px-2 text-zinc-700 ${alignCls(c.align)} ${c.align === 'right' ? 'tabular-nums' : ''}`}>
                  {c.render ? c.render(r) : String(r[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
