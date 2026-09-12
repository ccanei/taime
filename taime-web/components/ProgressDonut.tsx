// Grafico donut (SVG puro, sem lib) para progresso percentual. Server component.
// centerTop = numero grande (ex.: "2"), centerSub = rotulo (ex.: "de 20 respondidas").
export default function ProgressDonut({
  value, total, centerTop, centerSub, size = 108, stroke = 10,
}: {
  value: number
  total: number
  centerTop: string
  centerSub: string
  size?: number
  stroke?: number
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const cx = size / 2

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
           aria-label={`${pct}%`} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-zinc-100" />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          className="text-taime-500" strokeDasharray={`${dash.toFixed(1)} ${(c - dash).toFixed(1)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-2xl font-bold tabular-nums text-zinc-900 leading-none">{centerTop}</span>
        <span className="mt-0.5 text-[10px] text-zinc-400 leading-tight">{centerSub}</span>
      </div>
    </div>
  )
}
