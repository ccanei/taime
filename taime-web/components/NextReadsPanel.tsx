// ============================================================
// components/NextReadsPanel.tsx
// Recomendações de próxima leitura, baseadas no tema dominante
// das leituras recentes do usuário.
// ============================================================
'use client';

import Link from 'next/link';

export type NextRead = {
  reportId: string;
  titlePt: string;
  titleEn: string;
  periodLabel: string | null;
  score: number;
};

type Props = {
  items: NextRead[];
  topTheme: string | null;
  locale: 'pt' | 'en';
};

export default function NextReadsPanel({ items, topTheme, locale }: Props) {
  if (!items.length) return null;

  const heading =
    locale === 'pt'
      ? topTheme
        ? `Próximas leituras · porque você tem lido sobre ${topTheme}`
        : 'Próximas leituras'
      : topTheme
        ? `Next reads · because you've been reading about ${topTheme}`
        : 'Next reads';

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
        {heading}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((it) => {
          const title = locale === 'pt' ? it.titlePt : it.titleEn;
          return (
            <Link
              key={it.reportId}
              href={`/reports/${it.reportId}`}
              className="relative block rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-taime-200 hover:shadow-[0_4px_14px_rgba(79,70,229,0.06)]"
            >
              <div className="absolute top-4 right-4 flex h-[54px] w-[54px] flex-col items-center justify-center rounded-xl border border-taime-100 bg-taime-50">
                <span className="text-[22px] font-bold leading-none text-taime-600">
                  {it.score}
                </span>
                <span className="text-[9px] text-zinc-400 mt-0.5">score</span>
              </div>

              <div
                className="max-w-[78%] text-[15px] font-bold leading-snug tracking-tight text-zinc-900 overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {title}
              </div>

              {it.periodLabel ? (
                <div className="mt-2.5 text-xs text-zinc-500">{it.periodLabel}</div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
