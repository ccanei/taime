'use client'

import SignatureGraphic from '@/components/home/SignatureGraphic'

// "O framework TAIME" como ferramenta proprietaria nomeada: bloco editorial
// escuro com o grafico-assinatura, o fluxo TYPE->ACT->IMPACT->MOVE->EXIT como
// diagrama limpo, a leitura temporal THEN/NOW/NEXT e o TAIME Score. Conteudo via
// i18n (parity PT/EN); acronimos do framework sao fixos.
export interface FrameworkCopy {
  label:       string
  title:       string
  subtitle:    string
  flowCaption: string
  timeTitle:   string
  then:        string
  now:         string
  next:        string
  scoreTitle:  string
  scoreDesc:   string
}

const FLOW = ['TYPE', 'ACT', 'IMPACT', 'MOVE', 'EXIT']
const SCORE_DIMS = [92, 84, 79, 71, 88] // ilustrativo: 5 dimensoes do score

export default function FrameworkSection({ copy }: { copy: FrameworkCopy }) {
  return (
    <section className="relative bg-taime-900 overflow-hidden py-28">
      {/* Textura de pontos + glow, coerente com o hero */}
      <div aria-hidden="true" className="absolute inset-0 opacity-[0.08] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '26px 26px' }} />
      <div aria-hidden="true" className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-taime-600/20 blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6">
        <p className="text-[11px] font-bold tracking-widest uppercase text-taime-300 mb-4">{copy.label}</p>
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.05] mb-4">{copy.title}</h2>
        <p className="text-base text-white/60 max-w-2xl leading-relaxed mb-14">{copy.subtitle}</p>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Coluna A: grafico-assinatura + leitura temporal */}
          <div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6 mb-6">
              <SignatureGraphic labels={{ then: 'Then', now: 'Now', next: 'Next' }} className="w-full h-auto" />
            </div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-3">{copy.timeTitle}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: 'THEN', d: copy.then, dot: 'bg-zinc-400',   txt: 'text-zinc-300' },
                { k: 'NOW',  d: copy.now,  dot: 'bg-emerald-400', txt: 'text-emerald-300' },
                { k: 'NEXT', d: copy.next, dot: 'bg-taime-400',   txt: 'text-taime-300' },
              ].map(t => (
                <div key={t.k} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                  <p className={`flex items-center gap-1.5 text-[10px] font-bold tracking-widest mb-1.5 ${t.txt}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />{t.k}
                  </p>
                  <p className="text-xs text-white/70 leading-relaxed">{t.d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna B: fluxo do framework + score */}
          <div>
            {/* Fluxo TYPE -> ACT -> IMPACT -> MOVE -> EXIT */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-3 mb-4">
              {FLOW.map((step, i) => (
                <div key={step} className="flex items-center">
                  <span className="inline-flex items-center rounded-lg bg-white/[0.06] border border-white/10
                                   px-3 py-2 text-xs font-bold tracking-wide text-white">
                    {step}
                  </span>
                  {i < FLOW.length - 1 && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-taime-400 mx-0.5 shrink-0">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-10">{copy.flowCaption}</p>

            {/* TAIME Score */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-white">{copy.scoreTitle}</p>
                <span className="text-3xl font-bold tabular-nums text-taime-300">83</span>
              </div>
              <div className="flex items-end gap-1.5 h-16 mb-4">
                {SCORE_DIMS.map((v, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-taime-600/40 to-taime-400"
                       style={{ height: `${v}%` }} />
                ))}
              </div>
              <p className="text-xs text-white/50 leading-relaxed">{copy.scoreDesc}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
