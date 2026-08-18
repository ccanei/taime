'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'
import { isNetworkInterruption } from '@/lib/net'
import AdvisorMarkdown from '@/components/AdvisorMarkdown'
import AdvisorFeedback from '@/components/AdvisorFeedback'
import AdvisorArrival, { ArchiveDensity, type ArrivalStats, type ArrivalCard } from '@/components/AdvisorArrival'
import type { CategoryCount } from '@/lib/archive-stats'

interface Message {
  id:      string
  role:    'user' | 'assistant'
  content: string
}

const QUESTION_LIMIT = 3

// Rotulo por idioma das categorias de trend (para o bloqueio personalizado).
// Fallback: a propria categoria. Idioma-neutras ficam iguais nos dois.
const CAT_PT: Record<string, string> = {
  Cybersecurity: 'Cibersegurança', Regulation: 'Regulação', Infrastructure: 'Infraestrutura',
  Data: 'Dados', Market: 'Mercado', Automation: 'Automação', Observability: 'Observabilidade',
  Engineering: 'Engenharia', Sustainability: 'Sustentabilidade', Quantum: 'Quântica',
  Robotics: 'Robótica', 'AI Governance': 'Governança de IA', 'Spatial Computing': 'Computação Espacial',
  Networks: 'Redes',
}
const CAT_EN: Record<string, string> = { IA: 'AI' }
function catLabel(cat: string, isPt: boolean): string {
  return (isPt ? CAT_PT[cat] : CAT_EN[cat]) ?? cat
}
function joinThemes(themes: string[], isPt: boolean): string {
  const labels = [...new Set(themes.map(c => catLabel(c, isPt)))].slice(0, 3)
  if (labels.length <= 1) return labels[0] ?? ''
  return labels.slice(0, -1).join(', ') + (isPt ? ' e ' : ' and ') + labels[labels.length - 1]
}

// Tipagem minima do widget global do Turnstile.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string
        callback: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      reset: (id?: string) => void
    }
  }
}

export default function AskChat({ siteKey }: { siteKey: string | null }) {
  const { t, locale } = useLocale()
  const L = t.home.ask
  const C = L.columns   // conteudo das colunas laterais do /ask desktop
  const isPt = locale === 'pt'
  const numFmt = (n: number) => n.toLocaleString(isPt ? 'pt-BR' : 'en-US')

  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [used,     setUsed]     = useState(0)          // perguntas de tecnologia consumidas (cota de 3)
  const [interacted, setInteracted] = useState(false)  // ja fez ao menos 1 pergunta (tech ou meta)
  const [blocked,  setBlocked]  = useState<null | 'limit' | 'ip'>(null)
  const [error,    setError]    = useState('')
  const [token,    setToken]    = useState<string | null>(null)
  // PART 3: temas (categorias) acumulados na sessao para o bloqueio personalizado.
  const [sessionThemes, setSessionThemes] = useState<string[]>([])
  // PART 4: captura de e-mail no bloqueio (fluxo de newsletter existente).
  const [email,       setEmail]       = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [website,     setWebsite]     = useState('') // honeypot
  // Tela de chegada (aba Inicio) + numeros do arquivo (publico, sem vazar conteudo).
  const [view,         setView]         = useState<'home' | 'chat'>('home')
  const [archiveStats, setArchiveStats] = useState<ArrivalStats | null>(null)
  const [byCategory,   setByCategory]   = useState<CategoryCount[] | null>(null)  // "o acervo" (coluna esq.)

  const captchaRef = useRef<HTMLDivElement>(null)
  const widgetRendered = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Captcha so na 1a interacao do visitante (tech ou meta). Depois de provado
  // humano, nao repete, mesmo que a pergunta meta nao avance o contador de 3.
  const needsCaptcha = !interacted && !!siteKey

  // ── Carrega e renderiza o Turnstile antes da 1a pergunta ───────────────────
  useEffect(() => {
    if (!siteKey || interacted) return
    let cancelled = false

    function renderWidget() {
      if (cancelled || widgetRendered.current) return
      if (window.turnstile && captchaRef.current) {
        widgetRendered.current = true
        window.turnstile.render(captchaRef.current, {
          sitekey: siteKey!,
          theme:   'light',
          callback: (tk: string) => setToken(tk),
          'expired-callback': () => setToken(null),
          'error-callback':   () => setToken(null),
        })
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      const existing = document.querySelector('script[data-turnstile]')
      if (!existing) {
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', 'true')
        s.onload = renderWidget
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', renderWidget)
      }
      const poll = setInterval(() => { if (window.turnstile) { renderWidget(); clearInterval(poll) } }, 300)
      setTimeout(() => clearInterval(poll), 15000)
    }
    return () => { cancelled = true }
  }, [siteKey, interacted])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, blocked])

  // Numeros do arquivo para a linha de credibilidade. Publico, fail-safe.
  useEffect(() => {
    let cancelled = false
    fetch('/api/archive/stats')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled || !j) return
        if (j.stats) setArchiveStats(j.stats as ArrivalStats)
        if (Array.isArray(j.byCategory)) setByCategory(j.byCategory as CategoryCount[])
      })
      .catch(() => { /* blocos somem */ })
    return () => { cancelled = true }
  }, [])

  // Prefilla o composer com uma pergunta de exemplo e vai para a conversa (mesma
  // regra dos cards: nao envia direto, respeitando o captcha da 1a pergunta).
  function askExample(q: string) {
    setView('chat'); setInput(q); setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // Cards da chegada: prefilla o composer e vai para a conversa (nao envia direto,
  // respeitando o captcha da 1a pergunta do anonimo).
  const arrivalCards: ArrivalCard[] = (L.cards ?? []).map(c => ({
    iconKey:     c.iconKey,
    title:       c.title,
    description: c.description,
    onClick: () => { setView('chat'); setInput(c.prompt); setTimeout(() => textareaRef.current?.focus(), 0) },
  }))

  async function handleSend(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || loading || blocked) return
    if (needsCaptcha && !token) { setError(L.captchaWait); return }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, token }),
      })
      const json = await res.json() as {
        reply?: string; used?: number; limit?: number; error?: string; themes?: string[]
        meta?: boolean; metaLimitReached?: boolean
      }

      if (res.status === 503) { setBlocked(null); setError(L.unavailable); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      // Teto de 30 dias por IP: bloqueio persistente, mesma mensagem de cadastro do limite de 3.
      if (res.status === 429 && json.error === 'ip_month_limit') { setBlocked('limit'); setUsed(QUESTION_LIMIT); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if (res.status === 429 && json.error === 'ip_limit') { setBlocked('ip'); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if (res.status === 403 && json.error === 'limit_reached') { setBlocked('limit'); setUsed(QUESTION_LIMIT); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }
      if ((res.status === 403) && (json.error === 'captcha_failed' || json.error === 'captcha_required')) {
        setError(L.captchaFail); setToken(null); widgetRendered.current = false
        setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return
      }
      // Fluxo META (pergunta sobre o proprio TAIME): NAO consome a cota de 3 nem
      // bloqueia. Cota meta esgotada: mensagem fixa localizada convidando ao cadastro.
      if (json.metaLimitReached) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: L.metaLimit }])
        setInteracted(true); setToken(null); return
      }
      if (json.meta && json.reply) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: json.reply! }])
        setInteracted(true); setToken(null); return
      }

      if (!res.ok || !json.reply) { setError(L.genericError); setMessages(prev => prev.filter(m => m.id !== userMsg.id)); return }

      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: json.reply! }])
      if (Array.isArray(json.themes) && json.themes.length > 0) {
        setSessionThemes(prev => [...new Set([...prev, ...json.themes!])])
      }
      const nowUsed = json.used ?? used + 1
      setUsed(nowUsed)
      setInteracted(true)
      setToken(null)
      if (nowUsed >= (json.limit ?? QUESTION_LIMIT)) setBlocked('limit')
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      if (isNetworkInterruption(err)) {
        // Interrupcao (troca de aba/rede durante a geracao). O /ask nao tem
        // historico por design, entao nao ha o que recuperar: mensagem honesta.
        // A pergunta NAO e queimada: o contador de 3 (cookie) so avanca quando o
        // cliente recebe a resposta, e aqui nem mexemos em `used`. Reseta o token
        // (single-use) para liberar um novo desafio no reenvio.
        setError(L.interrupted)
        setToken(null); widgetRendered.current = false
      } else {
        setError(L.genericError)
      }
    } finally {
      setLoading(false)
    }
  }

  // PART 4: inscricao no Radar pelo bloqueio. Reusa /api/newsletter/subscribe
  // (mesma validacao, honeypot e tabela newsletter_subscribers da home).
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setEmailStatus('error'); return }
    setEmailStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), website, locale }),
      })
      if (!res.ok) { setEmailStatus('error'); return }
      setEmailStatus('sent'); setEmail('')
    } catch {
      setEmailStatus('error')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Contador de TECNOLOGIA: so aparece depois de consumir ao menos 1 pergunta de
  // tecnologia. Perguntas meta nao mexem em `used`, entao nao avancam o contador.
  const counter = used === 0
    ? null
    : L.counter(Math.min(used, QUESTION_LIMIT), QUESTION_LIMIT)

  // Desktop (lg+) na aba Inicio: tres colunas. Fora disso (mobile/tablet, ou aba
  // Conversa) fica na largura de leitura centralizada, como hoje.
  return (
    <div className={`mx-auto ${view === 'home' ? 'max-w-3xl lg:max-w-[1436px]' : 'max-w-3xl'}`}>
    <div className={`mb-6 text-center ${view === 'chat' ? '' : 'hidden'}`}>
      <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 leading-snug">{L.title}</h1>
      <p className="text-sm text-zinc-500 max-w-xl mx-auto leading-relaxed">{L.subtitle}</p>
    </div>
    <div className={view === 'home'
      ? 'lg:grid lg:grid-cols-[minmax(0,300px)_minmax(0,768px)_minmax(0,320px)] lg:gap-6 lg:justify-center lg:items-stretch'
      : ''}>

    {/* ── COLUNA ESQUERDA (so home + desktop): "o acervo" ──────────────────────
        So agregados: temas por categoria (contagem) + curva de sinais acumulados.
        Sem titulos, periodos, scores ou links. Fail-safe por bloco. */}
    {view === 'home' && (byCategory?.length || archiveStats?.byYear) && (
      <aside className="hidden lg:flex lg:flex-col gap-4 h-[calc(100vh-260px)] min-h-[480px] overflow-y-auto pr-1">
        {byCategory && byCategory.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{C.archiveTitle}</p>
            <p className="text-xs text-zinc-400 mb-3">{C.archiveSubtitle}</p>
            <ul className="space-y-1.5">
              {byCategory.slice(0, 12).map(c => (
                <li key={c.category} className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-zinc-700 truncate">{catLabel(c.category, isPt)}</span>
                  <span className="text-xs text-zinc-400 tabular-nums shrink-0">{numFmt(c.count)} {C.trendsWord}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {archiveStats?.byYear && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
            <ArchiveDensity byYear={archiveStats.byYear} isPt={isPt} />
          </div>
        )}
      </aside>
    )}

    <div className="flex flex-col h-[calc(100vh-260px)] min-h-[480px]
                    border border-zinc-200 rounded-2xl overflow-hidden bg-white">

      {/* Alternancia Inicio / Conversa */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-100 bg-white">
        {(['home', 'chat'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
              ${view === v ? 'bg-taime-50 text-taime-700' : 'text-zinc-400 hover:text-zinc-700'}`}>
            {v === 'home' ? L.tabHome : L.tabChat}
          </button>
        ))}
      </div>

      {/* Tela de chegada (aba Inicio): mesma primeira impressao, dado agregado publico. */}
      <div className={`flex-1 overflow-y-auto bg-zinc-50 ${view === 'home' ? '' : 'hidden'}`}>
        <div className="min-h-full flex flex-col justify-center">
        <AdvisorArrival
          subtitle={L.arrivalSubtitle}
          stats={archiveStats}
          cards={arrivalCards}
          isPt={isPt}
          hideTimeline
          placeholder={L.placeholder}
          onSubmit={(t) => {
            // Enviar da chegada inicia a conversa. Respeita o captcha da 1a
            // pergunta: se ainda falta o desafio, leva o texto ao composer do chat
            // (onde o widget aparece); senao, envia direto.
            setView('chat')
            if (needsCaptcha && !token) { setInput(t); setTimeout(() => textareaRef.current?.focus(), 0) }
            else { handleSend(t) }
          }}
        />
        </div>
      </div>

      {/* Header */}
      <div className={`items-center justify-between px-5 py-3 border-b border-zinc-100 bg-white ${view === 'chat' ? 'flex' : 'hidden'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                          text-xs font-bold text-white shrink-0">T</div>
          <h2 className="text-sm font-bold text-zinc-900 truncate">TAIME Executive Advisor</h2>
        </div>
        {counter && (
          <span className="text-xs font-medium text-zinc-400 tabular-nums whitespace-nowrap">{counter}</span>
        )}
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-5 py-6 space-y-4 bg-zinc-50 ${view === 'chat' ? '' : 'hidden'}`}>
        {messages.length === 0 && !loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                            text-xs font-bold text-white shrink-0">T</div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                            bg-white border border-zinc-200 text-zinc-800 shadow-sm">
              {L.subtitle}
            </div>
          </div>
        )}

        {/* Sugestoes fortes: agora vivem como cards na aba Inicio; no chat vazio um
            atalho discreto de volta a chegada evita duplicar a grade aqui. */}
        {messages.length === 0 && !loading && !blocked && (
          <div className="pl-10">
            <button onClick={() => setView('home')} className="text-xs font-medium text-taime-700 hover:text-taime-800 hover:underline">
              {isPt ? 'Ver sugestões de perguntas →' : 'See suggested questions →'}
            </button>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
              ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-taime-600 text-white'}`}>
              {msg.role === 'user' ? 'V' : 'T'}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-zinc-800 text-white rounded-tr-sm'
                : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'}`}>
              {msg.role === 'user'
                ? msg.content
                : (
                  <>
                    <AdvisorMarkdown content={msg.content} />
                    <AdvisorFeedback
                      question={messages[i - 1]?.role === 'user' ? messages[i - 1].content : ''}
                      answer={msg.content}
                      source="ask"
                      isPt={isPt}
                    />
                  </>
                )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                            text-xs font-bold text-white shrink-0">T</div>
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer / bloqueio (some na aba Inicio) */}
      <div className={`border-t border-zinc-100 bg-white px-5 py-4 ${view === 'chat' ? '' : 'hidden'}`}>
        {blocked ? (
          <div className="rounded-xl bg-taime-50 border border-taime-100 px-4 py-4 text-center">
            {/* PART 3: bloqueio personalizado citando os temas das perguntas (fallback generico). */}
            <p className="text-sm font-semibold text-zinc-900 mb-1">
              {blocked === 'ip'
                ? L.ipTitle
                : sessionThemes.length > 0
                  ? L.limitThemesTitle(joinThemes(sessionThemes, isPt))
                  : L.limitTitle}
            </p>
            <p className="text-sm text-zinc-600 mb-4">
              {blocked === 'ip'
                ? L.ipBody
                : sessionThemes.length > 0
                  ? L.limitThemesBody
                  : L.limitBody}
            </p>
            <Link href="/login" className="btn-primary px-5 py-2.5 text-sm inline-flex justify-center">
              {L.limitCta} →
            </Link>

            {/* PART 4: captura de e-mail, secundaria (nao compete com o CTA de cadastro). */}
            {blocked === 'limit' && (
              <div className="mt-4 pt-4 border-t border-taime-100">
                {emailStatus === 'sent' ? (
                  <p className="text-xs font-medium text-emerald-700">{L.emailOk}</p>
                ) : (
                  <>
                    <p className="text-xs text-zinc-500 mb-2">{L.emailPrompt}</p>
                    <form onSubmit={handleEmailSubmit} className="flex gap-2 max-w-sm mx-auto">
                      <input
                        type="text" name="website" value={website} tabIndex={-1} autoComplete="off"
                        aria-hidden="true" onChange={e => setWebsite(e.target.value)}
                        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                      />
                      <input
                        type="email" required value={email} placeholder={L.emailPlaceholder}
                        disabled={emailStatus === 'loading'}
                        onChange={e => setEmail(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-900
                                   placeholder:text-zinc-400 text-xs outline-none focus:ring-2 focus:ring-taime-600
                                   disabled:opacity-60"
                      />
                      <button
                        type="submit" disabled={emailStatus === 'loading'}
                        className="btn-secondary px-3 py-2 text-xs disabled:opacity-60 shrink-0">
                        {emailStatus === 'loading' ? '...' : L.emailCta}
                      </button>
                    </form>
                    {emailStatus === 'error' && <p className="text-xs text-red-600 mt-2">{L.emailErr}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        ) : !siteKey ? (
          <p className="text-sm text-zinc-500 text-center py-2">{L.unavailable}</p>
        ) : (
          <>
            {needsCaptcha && (
              <div className="mb-3 flex flex-col items-center gap-2">
                <div ref={captchaRef} />
                {!token && <p className="text-xs text-zinc-400">{L.captchaWait}</p>}
              </div>
            )}
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={L.placeholder}
                rows={2}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-2.5 text-sm
                           text-zinc-900 placeholder:text-zinc-400 outline-none
                           focus:ring-2 focus:ring-taime-600 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim() || (needsCaptcha && !token)}
                className="btn-primary px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                {loading ? L.sending : L.send}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 text-center">{L.note}</p>
          </>
        )}
      </div>
    </div>

    {/* ── COLUNA DIREITA (so home + desktop): "como funciona" ──────────────────
        Institucional: o que o Advisor entrega e nao faz, perguntas fortes de
        exemplo (prefillam o composer), e conversao discreta. Sem dado do acervo. */}
    {view === 'home' && (
      <aside className="hidden lg:flex lg:flex-col gap-4 h-[calc(100vh-260px)] min-h-[480px] overflow-y-auto pl-1">
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">{C.howTitle}</p>
          <p className="text-xs font-semibold text-zinc-700">{C.deliversTitle}</p>
          <ul className="mt-1.5 space-y-1">
            {C.delivers.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-500 leading-snug">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-taime-500 shrink-0" />{d}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold text-zinc-700">{C.avoidsTitle}</p>
          <ul className="mt-1.5 space-y-1">
            {C.avoids.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-500 leading-snug">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />{d}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">{C.examplesTitle}</p>
          <div className="flex flex-col gap-1.5">
            {C.examples.map((q, i) => (
              <button
                key={i}
                onClick={() => askExample(q)}
                className="text-left text-xs text-taime-700 bg-taime-50 hover:bg-taime-100 border border-taime-100
                           rounded-lg px-2.5 py-1.5 leading-snug transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-taime-200 bg-taime-50/60 shadow-sm p-4">
          <p className="text-sm font-bold text-zinc-800">{C.convTitle}</p>
          <p className="mt-1 text-xs text-zinc-600 leading-relaxed">{C.convBody}</p>
          <Link href="/login" className="btn-primary mt-3 w-full text-xs px-3 py-2 justify-center inline-flex">
            {C.convCta} →
          </Link>
        </div>
      </aside>
    )}

    </div>
    </div>
  )
}
