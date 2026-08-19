'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'
import { isNetworkInterruption } from '@/lib/net'
import AdvisorMarkdown from '@/components/AdvisorMarkdown'
import AdvisorFeedback from '@/components/AdvisorFeedback'
import AdvisorContactModal from '@/components/AdvisorContactModal'
import AdvisorContextPanel, { type PanelTurn, type FixedContext } from '@/components/AdvisorContextPanel'
import AdvisorArrival, { type ArrivalCard } from '@/components/AdvisorArrival'
import ActivePlanCard from '@/components/ActivePlanCard'
import { type PlanRecord } from '@/lib/advisor-plan'
import { LineChart, Target, MessageSquareText, MessageCircle, type LucideIcon } from 'lucide-react'

// Intencao de contato humano: pedir para falar com alguem/equipe/suporte/comercial.
const HANDOFF_RE = /\b(falar|conversar|contat\w+)\b[^.?!]{0,40}\b(algu[eé]m|uma pessoa|humano|pessoa real|equipe|time|suporte|comercial|vendas|atendimento|respons[aá]vel)\b|\b(talk|speak|connect|get in touch)\b[^.?!]{0,40}\b(someone|a (human|person|rep)|the team|sales|support|a human)\b|\b(human (support|agent|being)|real person|contact (the )?(team|support|sales))\b/i

// Roadmap extraido (Fase 2.1): estrutura que a resposta do Advisor pode virar plano.
// Tipos locais e leves (nao importa a lib server-side de extracao no bundle do client).
interface PlanActionData { text: string; status: 'todo' | 'doing' | 'done' }
interface PlanPhaseData  { label: string; actions: PlanActionData[]; avoid: string[]; exitCriteria: string }
interface PlanOfferData  { title: string; theme: string; phases: PlanPhaseData[] }

interface Message {
  id:         string
  role:       'user' | 'assistant'
  content:    string
  created_at: string
  citations?: Record<string, string>  // "reportId#trend-rank" -> titulo, p/ tooltip dos chips
  planOffer?: PlanOfferData | null     // roadmap salvavel detectado nesta resposta (Fase 2.1)
}

// Botao discreto de copiar (por resposta do Advisor). Copia o markdown limpo e da
// um feedback breve ("Copiado"). Aparece no hover da mensagem.
function CopyButton({ text, isPt }: { text: string; isPt: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard indisponivel: silencioso */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={isPt ? 'Copiar resposta' : 'Copy answer'}
      title={isPt ? 'Copiar' : 'Copy'}
      className={`absolute top-2 right-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px]
                  transition-opacity focus-visible:opacity-100 focus:outline-none
                  ${copied ? 'opacity-100 text-taime-700' : 'opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100'}`}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          <span className="font-medium">{isPt ? 'Copiado' : 'Copied'}</span>
        </>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

// Oferta discreta "Salvar como meu plano" (Fase 2.1). Aparece abaixo de uma resposta
// que contem um roadmap salvavel. O cliente decide: nada e persistido sem o clique.
// Cobre o fluxo de conflito de tema (substituir/criar novo) e o limite por plano.
type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'limit' | 'error' | 'dismissed'
function SavePlanOffer({ offer, sessionId, sourceMessageId, isPt, onSaved }: {
  offer: PlanOfferData; sessionId: string; sourceMessageId: string; isPt: boolean; onSaved?: () => void
}) {
  const [state, setState]       = useState<SaveState>('idle')
  const [conflictTitle, setConflictTitle] = useState<string | null>(null)
  const [limitInfo, setLimitInfo]         = useState<{ limit: number; plan: string } | null>(null)

  async function save(mode?: 'replace' | 'new') {
    setState('saving')
    try {
      const res = await fetch('/api/advisor/plans', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sessionId, sourceMessageId,
          title: offer.title, theme: offer.theme, phases: offer.phases,
          mode,
        }),
      })
      const json = await res.json() as {
        ok?: boolean; conflict?: string; existing?: { title?: string | null }
        error?: string; limit?: number; plan?: string
      }
      if (res.status === 409 && json.conflict === 'same_theme') {
        setConflictTitle(json.existing?.title ?? null)
        setState('conflict')
        return
      }
      if (res.status === 403 && json.error === 'limit_reached') {
        setLimitInfo({ limit: json.limit ?? 1, plan: json.plan ?? 'free' })
        setState('limit')
        return
      }
      if (!res.ok || !json.ok) { setState('error'); return }
      setState('saved')
      onSaved?.()
    } catch {
      setState('error')
    }
  }

  if (state === 'dismissed') return null

  const phaseCount = offer.phases.length
  const saving = state === 'saving'

  if (state === 'saved') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-taime-100 bg-taime-50/60 px-3 py-2 text-xs text-taime-800">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{isPt
          ? 'Plano salvo. Você acompanha as fases pelo seu histórico.'
          : 'Plan saved. You can track the phases from your history.'}</span>
      </div>
    )
  }

  if (state === 'conflict') {
    return (
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
        <p className="leading-snug">{isPt
          ? `Você já tem um plano ativo sobre este tema${conflictTitle ? ` (${conflictTitle})` : ''}. Quer substituir ou criar um novo?`
          : `You already have an active plan on this theme${conflictTitle ? ` (${conflictTitle})` : ''}. Replace it or create a new one?`}</p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => save('replace')} disabled={saving}
            className="text-xs font-semibold text-white bg-taime-600 hover:bg-taime-700 transition-colors rounded-md px-3 py-1.5 disabled:opacity-50">
            {isPt ? 'Substituir' : 'Replace'}
          </button>
          <button onClick={() => save('new')} disabled={saving}
            className="text-xs font-semibold text-taime-700 bg-white border border-taime-200 hover:bg-taime-50 transition-colors rounded-md px-3 py-1.5 disabled:opacity-50">
            {isPt ? 'Criar novo' : 'Create new'}
          </button>
          <button onClick={() => setState('dismissed')} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">
            {isPt ? 'Agora não' : 'Not now'}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'limit') {
    const n = limitInfo?.limit ?? 1
    return (
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
        <p className="leading-snug">{isPt
          ? `Você já tem ${n} ${n === 1 ? 'plano ativo' : 'planos ativos'}, o limite do seu acesso atual. Para salvar este, arquive um plano existente ou amplie seu acesso.`
          : `You already have ${n} active ${n === 1 ? 'plan' : 'plans'}, the limit of your current access. To save this one, archive an existing plan or expand your access.`}</p>
        <div className="mt-2 flex items-center gap-2">
          <a href="/planos" className="text-xs font-semibold text-taime-700 hover:text-taime-800 transition-colors">
            {isPt ? 'Ver planos' : 'View plans'}
          </a>
          <button onClick={() => setState('dismissed')} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">
            {isPt ? 'Dispensar' : 'Dismiss'}
          </button>
        </div>
      </div>
    )
  }

  // idle / saving / error
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5">
      <p className="text-xs text-zinc-500 leading-snug">{isPt
        ? `Este roadmap pode virar um plano seu: salvamos as ${phaseCount} ${phaseCount === 1 ? 'fase' : 'fases'} e você acompanha o progresso por aqui.`
        : `This roadmap can become your plan: we save the ${phaseCount} ${phaseCount === 1 ? 'phase' : 'phases'} and you track the progress here.`}</p>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => save()} disabled={saving}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-taime-700 bg-white border border-taime-200 hover:bg-taime-50 transition-colors rounded-md px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          {saving ? (isPt ? 'Salvando...' : 'Saving...') : (isPt ? 'Salvar como meu plano' : 'Save as my plan')}
        </button>
        {state !== 'saving' && (
          <button onClick={() => setState('dismissed')} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">
            {isPt ? 'Agora não' : 'Not now'}
          </button>
        )}
      </div>
      {state === 'error' && (
        <p className="mt-1.5 text-[11px] text-amber-700">{isPt
          ? 'Não deu para salvar agora. Tente novamente.'
          : 'Could not save right now. Please try again.'}</p>
      )}
    </div>
  )
}

interface AdvisorProfile {
  company_name: string | null
  sector:       string | null
}

interface SessionRow {
  session_id:       string
  title:            string | null
  last_activity_at: string
  message_count:    number
  archived_at:      string | null
  created_at:       string
  type?:            'trajectory' | 'decision' | 'tactical' | null
}

// Icone por tipo de conversa (do context_metadata da 1a resposta). Sem tipo -> neutro.
const SESSION_TYPE_ICON: Record<string, LucideIcon> = {
  trajectory: LineChart,        // trajetoria: linha temporal
  decision:   Target,           // prospectiva/decisao: alvo
  tactical:   MessageSquareText, // tatica/factual: conversa
}
function sessionIcon(type: SessionRow['type']): LucideIcon {
  return (type && SESSION_TYPE_ICON[type]) || MessageCircle
}

// Agrupa conversas por recencia, preservando a ordem (ja vem desc por atividade).
function groupSessions(
  sessions: SessionRow[],
  labels: { today: string; week: string; month: string; older: string },
): Array<{ key: string; label: string; items: SessionRow[] }> {
  const now = Date.now()
  const DAY = 86_400_000
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const b: Record<string, SessionRow[]> = { today: [], week: [], month: [], older: [] }
  for (const s of sessions) {
    const t = new Date(s.last_activity_at).getTime()
    if (t >= startOfToday.getTime()) b.today.push(s)
    else if (now - t < 7 * DAY)  b.week.push(s)
    else if (now - t < 30 * DAY) b.month.push(s)
    else b.older.push(s)
  }
  return (['today', 'week', 'month', 'older'] as const)
    .filter(k => b[k].length > 0)
    .map(k => ({ key: k, label: labels[k], items: b[k] }))
}

interface Props {
  userId:        string
  userName:      string | null
  userEmail:     string | null
  profile:       AdvisorProfile | null
  onOpenProfile?: () => void
  plan?:         string | null
  usage?:        { used: number; limit: number | null }
}

function deriveInitials(name: string | null, email: string | null): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0][0].toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  const e = (email ?? '').trim()
  if (e) return e[0].toUpperCase()
  return 'U'
}

const WELCOME_PT = `Olá! Sou o TAIME Executive Advisor. Uso a inteligência dos relatórios TAIME para te ajudar a transformar sinais tecnológicos em decisões estratégicas. Pode me contar o que está em jogo, e a gente afina o contexto conversando. Como posso ajudar hoje?`
const WELCOME_EN = `Hello! I'm the TAIME Executive Advisor. I draw on TAIME report intelligence to help you turn technology signals into strategic decisions. Just tell me what is at stake and we will work out the context as we talk. How can I help you today?`

function generateSessionId(): string {
  return crypto.randomUUID()
}

// Fallback client dos cards de chegada (usado so enquanto o /context nao respondeu
// ou se falhar). Generico, calibrado a "tecnologia estrategica".
interface HomeCardLite { iconKey: string; title: string; description: string; action: { kind: 'prompt' | 'session'; value: string } }
function fallbackHomeCards(isPt: boolean): HomeCardLite[] {
  const t = isPt ? 'tecnologia estratégica' : 'strategic technology'
  if (isPt) return [
    { iconKey: 'map',        title: `Onde ${t} está agora`, description: 'O estado atual e o que exige decisão', action: { kind: 'prompt', value: `Qual o estado atual de ${t} e o que muda para a minha empresa?` } },
    { iconKey: 'trajectory', title: `Trajetória de ${t}`,   description: 'Como evoluiu e para onde aponta',       action: { kind: 'prompt', value: `Como ${t} evoluiu ao longo do tempo e qual o NEXT?` } },
    { iconKey: 'focus',      title: `Onde focar em ${t}`,   description: 'Prioridade de investimento agora',      action: { kind: 'prompt', value: `Onde devo focar meu investimento em ${t} agora?` } },
    { iconKey: 'risk',       title: `Riscos em ${t}`,       description: 'O que a maioria das empresas ignora',   action: { kind: 'prompt', value: `Quais riscos de ${t} a maioria das empresas ignora?` } },
  ]
  return [
    { iconKey: 'map',        title: `Where ${t} stands now`, description: 'The current state and what needs a decision', action: { kind: 'prompt', value: `What is the current state of ${t} and what changes for my company?` } },
    { iconKey: 'trajectory', title: `Trajectory of ${t}`,    description: 'How it evolved and where it points',          action: { kind: 'prompt', value: `How has ${t} evolved over time and what is the NEXT?` } },
    { iconKey: 'focus',      title: `Where to focus on ${t}`, description: 'Investment priority right now',              action: { kind: 'prompt', value: `Where should I focus my investment in ${t} now?` } },
    { iconKey: 'risk',       title: `Risks in ${t}`,          description: 'What most companies overlook',               action: { kind: 'prompt', value: `Which risks in ${t} do most companies overlook?` } },
  ]
}

// "há 3 dias", "há 2h", "agora": formato compacto pt-BR.
function timeAgoPt(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1)   return 'agora'
  if (minutes < 60)  return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30)     return `há ${days}d`
  const months = Math.floor(days / 30)
  if (months < 12)   return `há ${months}m`
  return `há ${Math.floor(months / 12)}a`
}

function timeAgoEn(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1)   return 'just now'
  if (minutes < 60)  return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30)     return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12)   return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export default function AdvisorChat({ userId, userName, userEmail, profile, onOpenProfile, plan, usage }: Props) {
  const { locale }   = useLocale()
  const isPt         = locale === 'pt'
  const userInitials = deriveInitials(userName, userEmail)
  const timeAgo      = isPt ? timeAgoPt : timeAgoEn

  // ── Cota de mensagens (contador + bloqueio com CTA de upgrade) ──────────────
  const msgLimit = usage?.limit ?? null
  const [used, setUsed]       = useState(usage?.used ?? 0)
  const [blocked, setBlocked] = useState(
    msgLimit !== null && (usage?.used ?? 0) >= msgLimit,
  )
  const counterText = msgLimit === null ? null : (
    isPt
      ? `${used} de ${msgLimit} mensagens${plan === 'essential' ? ' neste ciclo' : ''}`
      : `${used} of ${msgLimit} messages${plan === 'essential' ? ' this cycle' : ''}`
  )
  const upgradeText = plan === 'free'
    ? (isPt ? 'Você usou suas 10 mensagens. Assine o Essential para 250 mensagens por mês.'
            : 'You have used your 10 messages. Subscribe to Essential for 250 messages per month.')
    : (isPt ? 'Você atingiu o limite deste ciclo. Assine o Strategic para uso ampliado.'
            : 'You reached the limit for this cycle. Subscribe to Strategic for expanded use.')
  const upgradeCta = isPt ? 'Ver planos' : 'View plans'

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  // Recuperacao pos-interrupcao: quando o fetch morre (troca de aba durante a
  // geracao), a resposta ja foi persistida no server (commit 3744604); aqui
  // recarregamos a conversa em vez de mostrar erro criptico.
  const [recovering, setRecovering] = useState(false)
  // Incidente 26/07: avisa (nao bloqueia) quando o backend nao pode gravar a
  // conversa no historico (history_saved=false, problema de infra de persistencia).
  const [historyWarn, setHistoryWarn] = useState(false)
  const [sessionId,  setSessionId]  = useState<string>('')
  const [hasHistory, setHasHistory] = useState(false)

  // Contato humano: popup (valvula) + oferta contextual quando a intencao aparece.
  const [contactOpen,    setContactOpen]    = useState(false)
  const [handoffOffered, setHandoffOffered] = useState(false)

  const [sessions,     setSessions]     = useState<SessionRow[]>([])
  const [viewArchived, setViewArchived] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)   // mobile only
  const [sessionQuery, setSessionQuery] = useState('')      // busca client-side na sidebar

  // ── Workspace: sidebar colapsavel + painel de contexto direito ──────────────
  const [collapsed,    setCollapsed]    = useState(true)    // sidebar colapsada por padrao no desktop
  const [latestPanel,  setLatestPanel]  = useState<PanelTurn | null>(null) // "Nesta resposta" do ultimo turno
  const [fixedContext, setFixedContext] = useState<FixedContext | null>(null) // perfil + temas + arquivo + home
  const [panelOpen,    setPanelOpen]    = useState(false)   // folha do painel no mobile
  const [view,         setView]         = useState<'home' | 'chat'>('home') // aba Inicio vs conversa
  const [activePlans,  setActivePlans]  = useState<PlanRecord[]>([])        // planos ativos (Fase 2.2)

  // ── Abertura proativa: sugestão de partida + chips, ancorada em trends reais.
  // Iniciativa do Advisor, fora da cota (nunca passa pelo /chat). Ver
  // app/api/advisor/opening/route.ts.
  const [opening,          setOpening]          = useState<{ text: string; chips: string[] } | null>(null)
  const [openingSuppressed, setOpeningSuppressed] = useState(false) // some ao começar a digitar
  const [isFirstEver,      setIsFirstEver]      = useState(false)    // 1ª conversa do usuário

  const bottomRef        = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLTextAreaElement>(null)
  const openingFetchedRef = useRef(false)
  const idleTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Sessao com envio em voo: setada no send, limpa no finally. Se continuar setada
  // quando a aba volta a ficar visivel, o fetch morreu -> recupera do server.
  const pendingSidRef     = useRef<string | null>(null)
  const recoveringRef     = useRef(false)
  // Espelha o sessionId atual para leitura fora do ciclo de render (ex: fetchOpening,
  // que e useCallback com deps [isPt] e capturaria um sessionId defasado).
  const sessionIdRef      = useRef<string>('')
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  // Estado da sidebar (expandida/colapsada) persiste na sessao do usuario.
  useEffect(() => {
    try {
      const v = localStorage.getItem('taime-advisor-sidebar')
      if (v === 'expanded') setCollapsed(false)
      else if (v === 'collapsed') setCollapsed(true)
    } catch { /* storage indisponivel: usa o default */ }
  }, [])
  function persistCollapsed(next: boolean) {
    setCollapsed(next)
    try { localStorage.setItem('taime-advisor-sidebar', next ? 'collapsed' : 'expanded') } catch { /* ignora */ }
  }

  // Clique num tema do painel: pre-preenche o composer com uma pergunta de
  // trajetoria daquele tema e foca (sem enviar: nao consome cota sem intencao).
  function handlePickTheme(label: string) {
    setView('chat')
    setInput(isPt ? `Como evoluiu ${label} ao longo do tempo?` : `How has ${label} evolved over time?`)
    setPanelOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Cards da tela de chegada (aba Inicio). Vem do /api/advisor/context (home);
  // fallback client generico se ainda nao carregou ou se a montagem falhou.
  const arrivalCards: ArrivalCard[] = (fixedContext?.home?.cards && fixedContext.home.cards.length > 0
    ? fixedContext.home.cards
    : fallbackHomeCards(isPt)
  ).map(c => ({
    iconKey:     c.iconKey,
    title:       c.title,
    description: c.description,
    onClick: () => {
      setView('chat')
      if (c.action.kind === 'session') selectSession(c.action.value)
      else handleSend(c.action.value)
    },
  }))

  // Contexto fixo do painel (perfil + temas). Uma vez, no mount. Fail-safe: se
  // falhar, o painel fixo fica vazio e a conversa segue normal.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/advisor/context?lang=${isPt ? 'pt' : 'en'}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled && j) setFixedContext(j as FixedContext) })
      .catch(() => { /* silencioso */ })
    return () => { cancelled = true }
  }, [isPt])

  // Planos ativos (Fase 2.2): alimenta o card da aba Inicio e o bloco do painel.
  // Fail-safe: falha ao carregar nao quebra a tela (fica sem card, com log).
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/advisor/plans')
      if (!res.ok) return
      const json = await res.json() as { plans?: PlanRecord[] }
      setActivePlans(json.plans ?? [])
    } catch (e) {
      console.error('[advisor-plans] load falhou (ignorado):', e instanceof Error ? e.message : e)
    }
  }, [])

  useEffect(() => { loadPlans() }, [loadPlans])

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (archived: boolean) => {
    const res = await fetch(`/api/advisor/sessions?archived=${archived ? '1' : '0'}`)
    if (!res.ok) return
    const json = await res.json() as { sessions?: SessionRow[] }
    setSessions(json.sessions ?? [])
  }, [])

  // Busca as mensagens de uma sessão do servidor (fonte de verdade), em ordem
  // cronológica. Reusado pelo carregamento normal E pela recuperação pós-interrupção.
  const fetchHistory = useCallback(async (sid: string): Promise<Message[]> => {
    const supabase = createSupabaseBrowser()
    const { data: msgs } = await supabase
      .from('advisory_memory')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .eq('session_id', sid)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(50)
    return msgs && msgs.length > 0 ? [...(msgs as Message[])].reverse() : []
  }, [userId])

  // Carrega mensagens de um session_id específico. Reusado pelo mount e pelo
  // clique numa sessão lateral.
  const loadHistoryFor = useCallback(async (sid: string) => {
    const msgs = await fetchHistory(sid)
    if (msgs.length > 0) { setMessages(msgs); setHasHistory(true) }
    else                 { setMessages([]);   setHasHistory(false) }
  }, [fetchHistory])

  // ── Mount: descobre a sessão mais recente e carrega ─────────────────────────

  useEffect(() => {
    async function bootstrap() {
      // Deep-link ?ask=<pergunta> (vindo do email de alerta new_signal): pre-preenche
      // o composer com a pergunta sugerida e abre a conversa. NAO envia sozinho (nao
      // consome cota sem intencao); o usuario revisa e envia.
      const askParam = new URLSearchParams(window.location.search).get('ask')
      if (askParam && askParam.trim()) {
        setInput(askParam.trim().slice(0, 500))
        setView('chat')
        setTimeout(() => inputRef.current?.focus(), 0)
      }

      // Deep-link ?session=<uuid> (vindo da pagina de planos, "Ver a conversa"):
      // abre direto aquela sessao em vez da mais recente. Fail-safe: id invalido ou
      // sem historico cai no fluxo normal.
      const requested = new URLSearchParams(window.location.search).get('session')
      if (requested && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)) {
        setSessionId(requested)
        await loadHistoryFor(requested)
        setView('chat')
        await loadSessions(false)
        return
      }

      const supabase = createSupabaseBrowser()
      const { data: latest } = await supabase
        .from('advisory_memory')
        .select('session_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (latest && latest.length > 0) {
        const sid = (latest[0] as { session_id: string }).session_id
        setSessionId(sid)
        await loadHistoryFor(sid)
      } else {
        // Nenhuma mensagem: primeira conversa do usuário. Abertura SEMPRE.
        setSessionId(generateSessionId())
        setHasHistory(false)
        setIsFirstEver(true)
      }
      await loadSessions(false)
    }
    bootstrap()
  }, [userId, loadHistoryFor, loadSessions])

  // ── Abertura proativa: busca a sugestão de partida ancorada no arquivo ──────

  const fetchOpening = useCallback(async () => {
    if (openingFetchedRef.current) return
    openingFetchedRef.current = true
    // Garante um sessionId estavel ANTES de gerar: a abertura e persistida sob ele
    // e o primeiro envio real reusa o mesmo id (handleSend faz sessionId || novo).
    let sid = sessionIdRef.current
    if (!sid) { sid = generateSessionId(); sessionIdRef.current = sid; setSessionId(sid) }
    try {
      const res = await fetch('/api/advisor/opening', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lang: isPt ? 'pt' : 'en', sessionId: sid }),
      })
      if (!res.ok) return
      const json = await res.json() as { opening?: string; chips?: string[] }
      if (json.opening) setOpening({ text: json.opening, chips: json.chips ?? [] })
    } catch {
      // silencioso: cai no WELCOME estático
    }
  }, [isPt])

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  // Conversa nova subsequente: só mostra a abertura se o usuário ficar parado
  // ~9s na tela vazia. Se ele começa a digitar antes, não aparece.
  const scheduleIdleOpening = useCallback(() => {
    clearIdle()
    idleTimerRef.current = setTimeout(() => {
      if (!inputRef.current?.value.trim()) fetchOpening()
    }, 9_000)
  }, [clearIdle, fetchOpening])

  // Primeira conversa do usuário: dispara a abertura imediatamente.
  useEffect(() => {
    if (isFirstEver) fetchOpening()
  }, [isFirstEver, fetchOpening])

  // "Some se começar a digitar": cancela abertura pendente e esconde a exibida.
  useEffect(() => {
    if (input.trim()) {
      clearIdle()
      setOpeningSuppressed(true)
    }
  }, [input, clearIdle])

  // Limpa o timer ao desmontar.
  useEffect(() => clearIdle, [clearIdle])

  // ── Refetch ao alternar aba ativa/arquivada ─────────────────────────────────

  useEffect(() => {
    loadSessions(viewArchived)
  }, [viewArchived, loadSessions])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Ações ───────────────────────────────────────────────────────────────────

  function newSession() {
    const sid = generateSessionId()
    setSessionId(sid)
    setMessages([])
    setHasHistory(false)
    setSessionsOpen(false)
    setLatestPanel(null)   // "Nesta resposta" e por turno: zera na conversa nova
    // Reinicia a abertura proativa para a nova conversa (idle-gated).
    clearIdle()
    openingFetchedRef.current = false
    setOpening(null)
    setOpeningSuppressed(false)
    scheduleIdleOpening()
    inputRef.current?.focus()
  }

  async function selectSession(sid: string) {
    if (sid === sessionId) {
      setSessionsOpen(false)
      return
    }
    setSessionId(sid)
    setSessionsOpen(false)
    setLatestPanel(null)   // zera o "Nesta resposta" ao trocar de sessao
    // Ao abrir uma sessão existente, não há abertura proativa (não é tela vazia).
    clearIdle()
    openingFetchedRef.current = true
    setOpening(null)
    setOpeningSuppressed(false)
    await loadHistoryFor(sid)
  }

  // Recupera a resposta persistida quando o fetch morre (troca de aba durante a
  // geracao). Faz polling curto: o server pode ainda estar terminando de gerar +
  // gravar quando a aba volta. Retorna true se a resposta do assistant apareceu.
  const recover = useCallback(async (sid: string): Promise<boolean> => {
    if (recoveringRef.current) return false
    recoveringRef.current = true
    setRecovering(true)
    try {
      for (let i = 0; i < 6; i++) {
        const msgs = await fetchHistory(sid)
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') {
          setMessages(msgs)
          setHasHistory(true)
          loadSessions(viewArchived)
          return true
        }
        await new Promise(r => setTimeout(r, 1500))
      }
      return false
    } finally {
      recoveringRef.current = false
      setRecovering(false)
    }
  }, [fetchHistory, loadSessions, viewArchived])

  // Backstop: ao voltar o foco com um envio ainda "em voo" (pendingSidRef setado),
  // o fetch pode ter morrido silenciosamente. Recupera do server.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      const sid = pendingSidRef.current
      if (sid && !recoveringRef.current) {
        recover(sid).then(ok => { if (ok) { pendingSidRef.current = null; setLoading(false) } })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [recover])

  async function handleSend(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || loading || blocked) return
    if (view !== 'chat') setView('chat')   // enviar sempre leva a conversa

    // Chip ou envio real: a abertura sai de cena (a conversa começou).
    clearIdle()
    setOpeningSuppressed(true)

    const sid = sessionId || generateSessionId()
    if (!sessionId) setSessionId(sid)

    const userMsg: Message = {
      id:         crypto.randomUUID(),
      role:       'user',
      content:    text,
      created_at: new Date().toISOString(),
    }

    // Se a conversa comeca com a abertura proativa, ela vira a PRIMEIRA mensagem do
    // transcript (o servidor ja a persistiu como assistant), para permanecer visivel
    // depois do 1o envio, nao so no bloco pre-envio. Na recarga, vem do advisory_memory.
    const openingSeed: Message[] = (messages.length === 0 && !hasHistory && opening)
      ? [{ id: crypto.randomUUID(), role: 'assistant', content: opening.text, created_at: new Date(Date.now() - 1000).toISOString() }]
      : []

    setMessages(prev => [...prev, ...openingSeed, userMsg])
    setInput('')
    setLoading(true)
    setHistoryWarn(false)
    pendingSidRef.current = sid

    try {
      const res  = await fetch('/api/advisor/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, sessionId: sid }),
      })
      const json = await res.json() as { reply?: string; error?: string; used?: number; limit?: number | null; history_saved?: boolean; citations?: Record<string, string>; context_panel?: PanelTurn | null; plan_offer?: PlanOfferData | null }

      // Cota esgotada: nada foi gerado nem consumido. Remove a mensagem otimista
      // e mostra o CTA de upgrade no lugar do input.
      if (res.status === 403 && json.error === 'message_limit_reached') {
        setMessages(prev => prev.filter(m => m.id !== userMsg.id))
        if (typeof json.used === 'number') setUsed(json.used)
        setBlocked(true)
        return
      }

      if (!res.ok || !json.reply) throw new Error(json.error ?? 'Erro na resposta')

      const assistantMsg: Message = {
        id:         crypto.randomUUID(),
        role:       'assistant',
        content:    json.reply,
        created_at: new Date().toISOString(),
        citations:  json.citations,
        planOffer:  json.plan_offer ?? undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      // Painel "Nesta resposta": popula com as analises que este turno consultou.
      if (json.context_panel) setLatestPanel(json.context_panel)
      // Persistencia: se o backend nao conseguiu gravar a conversa, avisa o usuario
      // (nao bloqueia; a resposta ja foi entregue).
      if (json.history_saved === false) setHistoryWarn(true)
      // Intencao de contato humano: o Advisor respondeu normalmente; alem disso,
      // oferecemos abrir o popup de contato. O Advisor segue a via principal.
      if (HANDOFF_RE.test(text)) setHandoffOffered(true)
      // Atualiza o contador com o estado real vindo do servidor; se esta foi a
      // ultima mensagem permitida, bloqueia o proximo envio.
      if (typeof json.used === 'number') {
        setUsed(json.used)
        if (msgLimit !== null && json.used >= msgLimit) setBlocked(true)
      }
      // Refresh da barra lateral: a sessão atual sobe pro topo da lista de
      // ativas, com title definido (se foi a primeira mensagem) e count atualizado.
      loadSessions(viewArchived)
    } catch (err) {
      if (isNetworkInterruption(err)) {
        // Interrupcao (troca de aba/rede durante a geracao): a resposta ja foi
        // gerada e PERSISTIDA no server (commit 3744604). Recupera do banco em vez
        // de mostrar erro criptico. Nunca exibe "Load failed"/"did not match".
        setLoading(false)
        const ok = await recover(sid)
        if (!ok) {
          setMessages(prev => [...prev, {
            id:         crypto.randomUUID(),
            role:       'assistant',
            content:    isPt
              ? 'A conexão caiu enquanto eu respondia. A resposta pode ter sido salva: recarregue a conversa ou pergunte de novo.'
              : 'The connection dropped while I was answering. The reply may have been saved: reload the conversation or ask again.',
            created_at: new Date().toISOString(),
          }])
        }
      } else {
        setMessages(prev => [...prev, {
          id:         crypto.randomUUID(),
          role:       'assistant',
          content:    isPt ? 'Desculpe, houve um erro. Tente novamente.' : 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        }])
      }
    } finally {
      pendingSidRef.current = null
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  // Filtro client-side por titulo (os dados ja estao carregados; sem nova chamada).
  const sessionQ = sessionQuery.trim().toLowerCase()
  const visibleSessions = sessionQ
    ? sessions.filter(s => (s.title ?? '').toLowerCase().includes(sessionQ))
    : sessions

  const sidebarBody = (
    <>
      <div className="px-3 py-3 border-b border-zinc-100">
        <button
          onClick={newSession}
          className="w-full text-xs font-semibold text-white bg-taime-600 hover:bg-taime-700
                     transition-colors rounded-lg px-3 py-2">
          + {isPt ? 'Novo contexto' : 'New chat'}
        </button>
      </div>

      <div className="flex border-b border-zinc-100 text-xs">
        <button
          onClick={() => setViewArchived(false)}
          className={`flex-1 py-2 font-medium transition-colors ${
            !viewArchived
              ? 'text-zinc-900 border-b-2 border-taime-600 bg-white'
              : 'text-zinc-400 hover:text-zinc-700'
          }`}>
          {isPt ? 'Ativas' : 'Active'}
        </button>
        <button
          onClick={() => setViewArchived(true)}
          className={`flex-1 py-2 font-medium transition-colors ${
            viewArchived
              ? 'text-zinc-900 border-b-2 border-taime-600 bg-white'
              : 'text-zinc-400 hover:text-zinc-700'
          }`}>
          {isPt ? 'Arquivadas' : 'Archived'}
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-100">
          <input
            type="text"
            value={sessionQuery}
            onChange={e => setSessionQuery(e.target.value)}
            placeholder={isPt ? 'Buscar conversas...' : 'Search conversations...'}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800
                       placeholder:text-zinc-400 outline-none focus:ring-1 focus:ring-taime-500 focus:border-transparent"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {visibleSessions.length === 0 ? (
          <p className="px-1 py-6 text-xs text-zinc-400 text-center">
            {sessionQ
              ? (isPt ? 'Nenhuma conversa encontrada.' : 'No conversation found.')
              : viewArchived
                ? (isPt ? 'Nenhuma sessão arquivada.' : 'No archived sessions.')
                : (isPt ? 'Nenhuma sessão anterior ainda.' : 'No previous sessions yet.')}
          </p>
        ) : (
          groupSessions(visibleSessions, isPt
            ? { today: 'Hoje', week: 'Esta semana', month: 'Este mês', older: 'Anteriores' }
            : { today: 'Today', week: 'This week', month: 'This month', older: 'Earlier' },
          ).map(group => (
            <div key={group.key} className="mb-3 last:mb-0">
              <p className="px-1.5 mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.items.map(s => {
                  const isActive = s.session_id === sessionId
                  const Icon = sessionIcon(s.type)
                  return (
                    <button
                      key={s.session_id}
                      onClick={() => selectSession(s.session_id)}
                      className={`w-full text-left rounded-lg border-l-2 pl-2 pr-2.5 py-2 flex items-start gap-2.5 transition-colors
                        ${isActive
                          ? 'border-taime-600 bg-taime-50/70'
                          : 'border-transparent hover:bg-white hover:shadow-sm'}`}>
                      <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5
                        ${isActive ? 'bg-taime-100 text-taime-700' : 'bg-zinc-100 text-zinc-500'}`}>
                        <Icon size={14} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs leading-snug line-clamp-2 ${isActive ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                          {s.title ?? (isPt ? 'Sem título' : 'Untitled')}
                        </span>
                        <span className="mt-1 block text-[10px] text-zinc-400 tabular-nums">
                          {timeAgo(s.last_activity_at)} · {s.message_count} {isPt ? 'msgs' : 'msgs'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[500px] border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-sm">

      {/* Sidebar desktop: colapsa em barra de icones; expande ao clicar (persiste). */}
      <aside className={`hidden md:flex md:flex-col bg-zinc-50 border-r border-zinc-200 shrink-0 transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-60 xl:w-72'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 py-3 overflow-y-auto">
            <button
              onClick={() => persistCollapsed(false)}
              title={isPt ? 'Expandir conversas' : 'Expand conversations'}
              aria-label={isPt ? 'Expandir conversas' : 'Expand conversations'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 transition-colors shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <button
              onClick={newSession}
              title={isPt ? 'Novo contexto' : 'New chat'}
              aria-label={isPt ? 'Novo contexto' : 'New chat'}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-taime-600 text-white hover:bg-taime-700 transition-colors shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            {/* Icones de tipo das conversas: dao sentido visual a barra colapsada. */}
            {visibleSessions.length > 0 && <div className="w-6 h-px bg-zinc-200 my-1 shrink-0" />}
            {visibleSessions.slice(0, 14).map(s => {
              const isActive = s.session_id === sessionId
              const Icon = sessionIcon(s.type)
              return (
                <button
                  key={s.session_id}
                  onClick={() => selectSession(s.session_id)}
                  title={s.title ?? (isPt ? 'Sem título' : 'Untitled')}
                  aria-label={s.title ?? (isPt ? 'Sem título' : 'Untitled')}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0
                    ${isActive ? 'bg-taime-50 text-taime-700 ring-1 ring-taime-200' : 'text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700'}`}>
                  <Icon size={16} strokeWidth={2} />
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pl-3 pr-2 py-2 border-b border-zinc-100">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{isPt ? 'Conversas' : 'Conversations'}</span>
              <button
                onClick={() => persistCollapsed(true)}
                title={isPt ? 'Colapsar' : 'Collapse'}
                aria-label={isPt ? 'Colapsar' : 'Collapse'}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 transition-colors">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
            </div>
            {sidebarBody}
          </>
        )}
      </aside>

      {/* Sidebar mobile (overlay) */}
      {sessionsOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <aside className="flex flex-col w-72 bg-zinc-50 border-r border-zinc-200 shadow-xl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
              <span className="text-xs font-bold text-zinc-700">{isPt ? 'Sessões' : 'Sessions'}</span>
              <button
                onClick={() => setSessionsOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-700 px-2">
                ✕
              </button>
            </div>
            {sidebarBody}
          </aside>
          <button
            onClick={() => setSessionsOpen(false)}
            className="flex-1 bg-black/40"
            aria-label="Fechar"
          />
        </div>
      )}

      {/* Chat */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSessionsOpen(true)}
              className="md:hidden text-zinc-500 hover:text-zinc-800 -ml-1 p-1"
              aria-label={isPt ? 'Abrir sessões' : 'Open sessions'}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-900 truncate">TAIME Executive Advisor</h2>
              {profile?.company_name && (
                <p className="text-xs text-zinc-400 truncate">{profile.company_name}{profile.sector ? ` · ${profile.sector}` : ''}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {counterText && (
              <span className={`text-xs font-medium whitespace-nowrap tabular-nums
                ${blocked ? 'text-taime-700' : 'text-zinc-400'}`}>
                {counterText}
              </span>
            )}
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className="text-xs font-medium text-zinc-400 hover:text-taime-700 transition-colors whitespace-nowrap hidden sm:block">
                {isPt ? 'Completar meu perfil' : 'Complete my profile'}
              </button>
            )}
            {/* Acesso permanente aos planos salvos, independente de haver plano ativo
                (evita beco sem saida ao arquivar o ultimo plano). */}
            <a
              href="/dashboard/advisor/plans"
              className="text-xs font-medium text-zinc-400 hover:text-taime-700 transition-colors whitespace-nowrap hidden sm:block">
              {isPt ? 'Meus planos' : 'My plans'}
            </a>
            {/* Valvula discreta: falar com a equipe. O Advisor segue como via principal. */}
            <button
              onClick={() => setContactOpen(true)}
              className="text-xs font-medium text-zinc-400 hover:text-taime-700 transition-colors whitespace-nowrap hidden sm:block">
              {isPt ? 'Falar com a equipe' : 'Talk to the team'}
            </button>
            {/* Acesso ao painel de contexto no mobile/telas estreitas (< lg). */}
            <button
              onClick={() => setPanelOpen(true)}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-taime-700 transition-colors whitespace-nowrap"
              aria-label={isPt ? 'Abrir contexto' : 'Open context'}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              {isPt ? 'Contexto' : 'Context'}
            </button>
          </div>
        </div>

        {/* Alternancia Inicio / Conversa (discreta, no topo da area central). */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-zinc-100 bg-white">
          {(['home', 'chat'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                ${view === v ? 'bg-taime-50 text-taime-700' : 'text-zinc-400 hover:text-zinc-700'}`}>
              {v === 'home' ? (isPt ? 'Início' : 'Home') : (isPt ? 'Conversa' : 'Conversation')}
            </button>
          ))}
        </div>

        {/* Tela de chegada (aba Inicio). Centraliza verticalmente quando sobra
            espaco; em telas curtas cresce e rola sem cortar o topo. */}
        <div className={`flex-1 overflow-y-auto bg-zinc-50 ${view === 'home' ? '' : 'hidden'}`}>
          <div className="min-h-full flex flex-col justify-center">
            {activePlans.length > 0 && (
              <div className="w-full px-2 pt-6">
                <ActivePlanCard plans={activePlans} isPt={isPt} />
              </div>
            )}
            <AdvisorArrival
              wide
              subtitle={isPt
                ? 'Inteligência estratégica aplicada à realidade da sua empresa'
                : 'Strategic intelligence applied to your company reality'}
              stats={fixedContext?.archive ?? null}
              cards={arrivalCards}
              isPt={isPt}
              placeholder={isPt
                ? 'Pergunte sobre tendências, estratégia ou decisões tecnológicas...'
                : 'Ask about trends, strategy or technology decisions...'}
              onSubmit={(t) => handleSend(t)}
            />
          </div>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto px-4 py-6 bg-zinc-50 ${view === 'chat' ? '' : 'hidden'}`}>
         {/* Coluna de leitura centralizada (só desktop, lg+): o ganho de largura vai
             para respiro e para as laterais, nunca para linhas de texto mais longas.
             Abaixo de lg (mobile/tablet) a coluna fica cheia como antes. */}
         <div className="mx-auto w-full lg:max-w-3xl space-y-4">

          {/* Abertura proativa ancorada no arquivo (sugestão + chips). Some ao
              começar a digitar; nunca conta contra a cota de mensagens. */}
          {messages.length === 0 && !loading && !hasHistory && opening && !openingSuppressed && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                               text-xs font-bold text-white shrink-0">T</div>
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                                bg-white border border-zinc-200 text-zinc-800 shadow-sm">
                  <AdvisorMarkdown content={opening.text} />
                </div>
              </div>
              {opening.chips.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-10">
                  {opening.chips.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(chip)}
                      disabled={loading}
                      className="text-xs font-medium text-taime-700 bg-taime-50 hover:bg-taime-100
                                 border border-taime-100 rounded-full px-3 py-1.5 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed">
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback estático: enquanto a abertura carrega, se falhar, ou antes
              do idle timer numa conversa nova subsequente. */}
          {messages.length === 0 && !loading && !hasHistory && !opening && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                             text-xs font-bold text-white shrink-0">T</div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                              bg-white border border-zinc-200 text-zinc-800 shadow-sm">
                {isPt ? WELCOME_PT : WELCOME_EN}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
                ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-taime-600 text-white'}`}>
                {msg.role === 'user' ? userInitials : 'T'}
              </div>
              <div className={`group relative max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-zinc-800 text-white rounded-tr-sm'
                  : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'}`}>
                {msg.role === 'user'
                  ? msg.content.split('\n').map((line, j) => (
                      <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                    ))
                  : (
                    <>
                      <CopyButton text={msg.content} isPt={isPt} />
                      <AdvisorMarkdown content={msg.content} citations={msg.citations} />
                      <AdvisorFeedback
                        question={messages[i - 1]?.role === 'user' ? messages[i - 1].content : ''}
                        answer={msg.content}
                        source="advisor"
                        isPt={isPt}
                      />
                      {msg.planOffer && msg.planOffer.phases.length > 0 && (
                        <SavePlanOffer
                          offer={msg.planOffer}
                          sessionId={sessionId}
                          sourceMessageId={msg.id}
                          isPt={isPt}
                          onSaved={loadPlans}
                        />
                      )}
                    </>
                  )}
              </div>
            </div>
          ))}

          {(loading || recovering) && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                             text-xs font-bold text-white shrink-0">T</div>
              <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                {recovering ? (
                  <p className="text-sm text-zinc-500">{isPt ? 'Recuperando a resposta...' : 'Recovering the answer...'}</p>
                ) : (
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
         </div>
        </div>

        {/* Oferta contextual: aparece quando o usuario pede contato humano. */}
        {handoffOffered && !contactOpen && (
          <div className="border-t border-taime-100 bg-taime-50/60 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-600 leading-snug">
              {isPt ? 'Prefere falar com uma pessoa do time?' : 'Prefer to reach a person on the team?'}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setContactOpen(true)}
                className="text-xs font-semibold text-white bg-taime-600 hover:bg-taime-700 transition-colors rounded-lg px-3 py-1.5">
                {isPt ? 'Falar com a equipe' : 'Talk to the team'}
              </button>
              <button
                onClick={() => setHandoffOffered(false)}
                aria-label={isPt ? 'Dispensar' : 'Dismiss'}
                className="text-zinc-400 hover:text-zinc-600 p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* Aviso de persistencia: a resposta foi entregue mas nao pode ser gravada
            no historico (problema de infra). Nao bloqueia a conversa. */}
        {historyWarn && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-800 leading-snug">
              {isPt
                ? 'Esta conversa nao pode ser salva no seu historico agora (problema temporario). A resposta acima esta correta; o registro pode nao aparecer nas suas sessoes.'
                : 'This conversation could not be saved to your history right now (temporary issue). The answer above is fine; the record may not appear in your sessions.'}
            </p>
            <button
              onClick={() => setHistoryWarn(false)}
              aria-label={isPt ? 'Dispensar' : 'Dismiss'}
              className="text-amber-500 hover:text-amber-700 p-1 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Input (ou CTA de upgrade quando a cota esgota). Some na aba Inicio.
            Alinhado a mesma coluna de leitura das mensagens. */}
        <div className={`border-t border-zinc-100 bg-white px-4 py-3 ${view === 'chat' ? '' : 'hidden'}`}>
          <div className="mx-auto w-full lg:max-w-3xl">
          {blocked ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between
                            rounded-xl bg-taime-50 border border-taime-100 px-4 py-3">
              <p className="text-sm text-zinc-700 leading-snug">{upgradeText}</p>
              <a
                href="/planos"
                className="btn-primary px-4 py-2 text-sm whitespace-nowrap shrink-0 justify-center">
                {upgradeCta} →
              </a>
            </div>
          ) : (
            <>
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isPt ? 'Pergunte sobre tendências, estratégia ou decisões tecnológicas... (Enter para enviar)'
                         : 'Ask about trends, strategy or technology decisions... (Enter to send)'
                  }
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-2.5 text-sm
                             text-zinc-900 placeholder:text-zinc-400 outline-none
                             focus:ring-2 focus:ring-taime-600 focus:border-transparent
                             disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-zinc-300 mt-1.5 text-right">Shift+Enter para nova linha</p>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Painel de contexto (workspace): fixo a direita no desktop (>= lg).
          Fundo tonal para os cards brancos do painel se destacarem como camadas. */}
      <aside className="hidden lg:flex lg:flex-col w-[320px] xl:w-[360px] 2xl:w-[400px] shrink-0 border-l border-zinc-200 bg-zinc-50 overflow-y-auto">
        <AdvisorContextPanel
          turn={latestPanel}
          loading={loading || recovering}
          isPt={isPt}
          fixed={fixedContext}
          activePlan={activePlans[0] ?? null}
          onOpenProfile={onOpenProfile}
          onPickTheme={handlePickTheme}
        />
      </aside>

      {/* Painel de contexto no mobile/telas estreitas: folha sobre o chat. */}
      {panelOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex">
          <button onClick={() => setPanelOpen(false)} className="flex-1 bg-black/40" aria-label={isPt ? 'Fechar' : 'Close'} />
          <aside className="flex flex-col w-80 max-w-[85%] bg-zinc-50 border-l border-zinc-200 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 sticky top-0 bg-white">
              <span className="text-xs font-bold text-zinc-700">{isPt ? 'Contexto' : 'Context'}</span>
              <button onClick={() => setPanelOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1" aria-label={isPt ? 'Fechar' : 'Close'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <AdvisorContextPanel
              turn={latestPanel}
              loading={loading || recovering}
              isPt={isPt}
              fixed={fixedContext}
              activePlan={activePlans[0] ?? null}
              onOpenProfile={onOpenProfile}
              onPickTheme={handlePickTheme}
            />
          </aside>
        </div>
      )}

      {contactOpen && (
        <AdvisorContactModal
          isPt={isPt}
          conversationId={sessionId || null}
          onClose={() => { setContactOpen(false); setHandoffOffered(false) }}
        />
      )}
    </div>
  )
}
