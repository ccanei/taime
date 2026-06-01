// ============================================================
// components/ContinueReadingCard.tsx
// ENTREGA 1 — card "continuar de onde parou"
// ============================================================
'use client';

import Link from 'next/link';

type Props = {
  reportId: string;
  titlePt: string;
  titleEn: string;
  periodLabel: string | null;
  scrollPct: number;
  locale: 'pt' | 'en';
};

const STRINGS = {
  pt: { kicker: 'Continuar lendo' },
  en: { kicker: 'Continue reading' },
} as const;

export default function ContinueReadingCard({
  reportId,
  titlePt,
  titleEn,
  periodLabel,
  scrollPct,
  locale,
}: Props) {
  const t = STRINGS[locale];
  const title = locale === 'pt' ? titlePt : titleEn;
  const pct = Math.min(100, Math.max(0, scrollPct));

  return (
    <Link
      href={`/reports/${reportId}`}
      className="block rounded-2xl border border-taime-200 bg-gradient-to-b from-white to-taime-50 p-5 mb-8 transition hover:to-taime-100"
    >
      <div className="text-[11px] font-bold uppercase tracking-wider text-taime-600">
        {t.kicker}
      </div>
      <div
        className="text-lg font-bold tracking-tight text-zinc-900 mt-1 overflow-hidden"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {title}
      </div>

      <div className="mt-4 h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-taime-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-zinc-500 mt-1.5">
        {pct}%{periodLabel ? ` · ${periodLabel}` : ''}
      </div>
    </Link>
  );
}
