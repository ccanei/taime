import Link from 'next/link'
import AdminNav from '@/components/AdminNav'

// ── Header padrao das paginas admin (breadcrumb + nav + pill) ────────────────
export function AdminHeader({ title, active }: { title: string; active: string }) {
  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">← Dashboard</Link>
          <span className="text-zinc-200">/</span>
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
          <AdminNav active={active} />
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">Admin</span>
      </div>
    </header>
  )
}

// ── Badge de status (semantica de cor unica em todo o admin) ─────────────────
const BADGE: Record<string, string> = {
  published:      'bg-emerald-50 text-emerald-700 border-emerald-100',
  approved:       'bg-emerald-50 text-emerald-700 border-emerald-100',
  active:         'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
  pending:        'bg-amber-50 text-amber-700 border-amber-100',
  needs_review:   'bg-amber-50 text-amber-700 border-amber-100',
  draft:          'bg-zinc-100 text-zinc-600 border-zinc-200',
  rejected:       'bg-red-50 text-red-700 border-red-100',
  archived:       'bg-zinc-100 text-zinc-500 border-zinc-200',
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${BADGE[status] ?? BADGE.draft}`}>
      {status}
    </span>
  )
}

// ── Kit visual do cockpit admin. Tudo SVG/CSS proprio, zero dependencia nova,
//    no mesmo idioma do sparkline/timeline de /admin/telemetry. Componentes puros
//    (sem hooks): renderizam no servidor; a agregacao vem pronta em props compactas.
//    Regua de cores: branco dominante, navy (zinc-900) no numero, azul eletrico
//    (taime) como acento; verde/ambar/vermelho SO para semantica de status.

// ── Formatadores ─────────────────────────────────────────────────────────────
export const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR')
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(Math.round(n))
}
export const fmtPct = (n: number, d = 0) => `${n.toFixed(d)}%`
export function fmtUsd(n: number): string {
  const dec = Math.abs(n) < 10 ? 4 : 2
  return '$' + n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

type Tone = 'good' | 'warn' | 'bad'
const TONE_CARD: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50',
  warn: 'border-amber-200 bg-amber-50',
  bad:  'border-red-200 bg-red-50',
}
const TONE_NUM: Record<Tone, string> = {
  good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700',
}

// ── StatCard: numero grande + label + delta vs periodo anterior ──────────────
export function StatCard({
  label, value, delta, deltaGoodWhenUp = true, tone, hint, href,
}: {
  label: string
  value: string
  delta?: number          // variacao percentual vs periodo anterior
  deltaGoodWhenUp?: boolean
  tone?: Tone
  hint?: string
  href?: string
}) {
  const body = (
    <div className={`rounded-2xl border p-5 h-full ${tone ? TONE_CARD[tone] : 'border-zinc-200 bg-white'} ${href ? 'hover:border-taime-300 hover:shadow-sm transition-all' : ''}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-2 flex items-end gap-2 flex-wrap">
        <p className={`text-2xl font-bold tabular-nums leading-none ${tone ? TONE_NUM[tone] : 'text-zinc-900'}`}>{value}</p>
        {typeof delta === 'number' && Number.isFinite(delta) && <DeltaBadge delta={delta} goodWhenUp={deltaGoodWhenUp} />}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-zinc-400 leading-snug">{hint}</p>}
    </div>
  )
  return href ? <Link href={href} className="block h-full">{body}</Link> : body
}

function DeltaBadge({ delta, goodWhenUp }: { delta: number; goodWhenUp: boolean }) {
  const up = delta > 0.05, down = delta < -0.05
  const good = up ? goodWhenUp : down ? !goodWhenUp : true
  const color = up || down ? (good ? 'text-emerald-600' : 'text-red-600') : 'text-zinc-400'
  const arrow = up ? 'M12 5v14M5 12l7-7 7 7' : down ? 'M12 19V5M5 12l7 7 7-7' : 'M5 12h14'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${color}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={arrow} /></svg>
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

// ── Section: bloco com titulo + nota + conteudo em card ──────────────────────
export function Section({ title, note, right, children, className = '' }: {
  title: string; note?: string; right?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`mt-8 ${className}`}>
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">{title}</h2>
          {note && <p className="text-xs text-zinc-400 mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">{children}</div>
    </section>
  )
}

// ── TrendLine: serie temporal (area + linha) com tooltip por ponto no hover ──
export function TrendLine({
  data, height = 120, valueFmt = fmtInt, unit = '',
}: {
  data: Array<{ label: string; value: number }>
  height?: number
  valueFmt?: (n: number) => string
  unit?: string
}) {
  if (data.length < 2) {
    return <div className="h-24 flex items-center justify-center text-xs text-zinc-400">Série insuficiente para tendência.</div>
  }
  const W = 600, H = 100, PAD = 4
  const max = Math.max(...data.map(d => d.value), 1)
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => (H - PAD) - (v / max) * (H - 2 * PAD)
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const area = `${x(0).toFixed(1)},${H - PAD} ${line} ${x(data.length - 1).toFixed(1)},${H - PAD}`
  const lastI = data.length - 1
  const midI = Math.floor(lastI / 2)
  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full block" aria-hidden>
          <polygon points={area} className="fill-taime-500" opacity="0.12" />
          <polyline points={line} fill="none" className="stroke-taime-500" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(lastI)} cy={y(data[lastI].value)} r="2.6" className="fill-taime-600" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <div key={i} className="group relative flex-1 border-l border-transparent hover:border-zinc-100" title={`${d.label}: ${valueFmt(d.value)}${unit}`}>
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity tabular-nums z-10">
                {d.label} · {valueFmt(d.value)}{unit}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400 tabular-nums">
        <span>{data[0].label}</span>
        {data.length > 6 && <span>{data[midI].label}</span>}
        <span>{data[lastI].label}</span>
      </div>
    </div>
  )
}

// ── BarRow: barras horizontais para rankings / distribuicoes ─────────────────
export function BarRow({
  items, valueFmt = fmtInt, max: maxProp,
}: {
  items: Array<{ label: string; value: number; sub?: string }>
  valueFmt?: (n: number) => string
  max?: number
}) {
  if (items.length === 0) return <p className="text-xs text-zinc-400">Sem dados.</p>
  const max = maxProp ?? Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-xs text-zinc-600 truncate" title={it.label}>{it.label}</span>
          <div className="flex-1 h-5 rounded bg-zinc-100 overflow-hidden">
            <div className="h-full rounded bg-taime-500/80" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right text-xs font-semibold text-zinc-800 tabular-nums">{valueFmt(it.value)}</span>
          {it.sub && <span className="w-10 shrink-0 text-right text-[10px] text-zinc-400 tabular-nums">{it.sub}</span>}
        </div>
      ))}
    </div>
  )
}

// ── StackBar (DonutOrStack): proporcoes simples numa barra + legenda ─────────
const STACK_PALETTE = ['#1D4ED8', '#5479ff', '#93b0ff', '#c5d6ff', '#a1a1aa', '#e4e4e7']
const SEMANTIC: Record<string, string> = {
  published: '#059669', approved: '#059669', active: '#059669', pass: '#059669',
  pending_review: '#d97706', pending: '#d97706', draft: '#a1a1aa', needs_review: '#d97706',
  rejected: '#dc2626', fail: '#dc2626', archived: '#a1a1aa',
}
export function StackBar({ segments }: { segments: Array<{ label: string; value: number; color?: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const withColor = segments.map((s, i) => ({ ...s, color: s.color ?? SEMANTIC[s.label] ?? STACK_PALETTE[i % STACK_PALETTE.length] }))
  return (
    <div>
      <div className="flex h-4 w-full rounded-full overflow-hidden bg-zinc-100">
        {withColor.map((s, i) => (
          <div key={i} className="h-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${fmtInt(s.value)}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {withColor.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="font-semibold text-zinc-800 tabular-nums">{fmtInt(s.value)}</span>
            <span className="text-zinc-400 tabular-nums">{((s.value / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sparkline: mini linha para celulas de tabela ─────────────────────────────
export function Sparkline({ data, width = 72, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <span className="text-[10px] text-zinc-300 tabular-nums">n/d</span>
  const max = Math.max(...data, 1)
  const x = (i: number) => (i / (data.length - 1)) * width
  const y = (v: number) => height - 1 - (v / max) * (height - 2)
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle" aria-hidden>
      <polyline points={pts} fill="none" className="stroke-taime-500" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── EmptyState elegante ──────────────────────────────────────────────────────
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-400">
      {children}
    </div>
  )
}
