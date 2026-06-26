'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'
import AdvisorMarkdown from '@/components/AdvisorMarkdown'

interface Message {
  id:         string
  role:       'user' | 'assistant'
  content:    string
  created_at: string
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
}

interface Props {
  userId:        string
  userName:      string | null
  userEmail:     string | null
  profile:       AdvisorProfile | null
  onOpenProfile?: () => void
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

export default function AdvisorChat({ userId, userName, userEmail, profile, onOpenProfile }: Props) {
  const { locale }   = useLocale()
  const isPt         = locale === 'pt'
  const userInitials = deriveInitials(userName, userEmail)
  const timeAgo      = isPt ? timeAgoPt : timeAgoEn

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [sessionId,  setSessionId]  = useState<string>('')
  const [hasHistory, setHasHistory] = useState(false)

  const [sessions,     setSessions]     = useState<SessionRow[]>([])
  const [viewArchived, setViewArchived] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)   // mobile only

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (archived: boolean) => {
    const res = await fetch(`/api/advisor/sessions?archived=${archived ? '1' : '0'}`)
    if (!res.ok) return
    const json = await res.json() as { sessions?: SessionRow[] }
    setSessions(json.sessions ?? [])
  }, [])

  // Carrega mensagens de um session_id específico. Reusado pelo mount e pelo
  // clique numa sessão lateral. Mantém o desempate (created_at desc, id desc) +
  // reverse para não reintroduzir o bug da última resposta sumida.
  const loadHistoryFor = useCallback(async (sid: string) => {
    const supabase = createSupabaseBrowser()
    const { data: msgs } = await supabase
      .from('advisory_memory')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .eq('session_id', sid)
      .order('created_at', { ascending: false })
      .order('id',         { ascending: false })
      .limit(50)

    if (msgs && msgs.length > 0) {
      setMessages([...(msgs as Message[])].reverse())
      setHasHistory(true)
    } else {
      setMessages([])
      setHasHistory(false)
    }
  }, [userId])

  // ── Mount: descobre a sessão mais recente e carrega ─────────────────────────

  useEffect(() => {
    async function bootstrap() {
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
        setSessionId(generateSessionId())
        setHasHistory(false)
      }
      await loadSessions(false)
    }
    bootstrap()
  }, [userId, loadHistoryFor, loadSessions])

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
    inputRef.current?.focus()
  }

  async function selectSession(sid: string) {
    if (sid === sessionId) {
      setSessionsOpen(false)
      return
    }
    setSessionId(sid)
    setSessionsOpen(false)
    await loadHistoryFor(sid)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const sid = sessionId || generateSessionId()
    if (!sessionId) setSessionId(sid)

    const userMsg: Message = {
      id:         crypto.randomUUID(),
      role:       'user',
      content:    text,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res  = await fetch('/api/advisor/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, sessionId: sid }),
      })
      const json = await res.json() as { reply?: string; error?: string }
      if (!res.ok || !json.reply) throw new Error(json.error ?? 'Erro na resposta')

      const assistantMsg: Message = {
        id:         crypto.randomUUID(),
        role:       'assistant',
        content:    json.reply,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
      // Refresh da barra lateral: a sessão atual sobe pro topo da lista de
      // ativas, com title definido (se foi a primeira mensagem) e count atualizado.
      loadSessions(viewArchived)
    } catch (err) {
      setMessages(prev => [...prev, {
        id:         crypto.randomUUID(),
        role:       'assistant',
        content:    `Desculpe, houve um erro. Tente novamente. (${err})`,
        created_at: new Date().toISOString(),
      }])
    } finally {
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

      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <p className="px-3 py-6 text-xs text-zinc-400 text-center">
            {viewArchived
              ? (isPt ? 'Nenhuma sessão arquivada.' : 'No archived sessions.')
              : (isPt ? 'Nenhuma sessão anterior ainda.' : 'No previous sessions yet.')}
          </p>
        ) : (
          sessions.map(s => {
            const isActive = s.session_id === sessionId
            return (
              <button
                key={s.session_id}
                onClick={() => selectSession(s.session_id)}
                className={`w-full text-left px-3 py-2 border-l-2 transition-colors
                  ${isActive
                    ? 'border-taime-600 bg-taime-50/50'
                    : 'border-transparent hover:bg-zinc-50'}`}>
                <p className={`text-xs truncate ${isActive ? 'font-semibold text-zinc-900' : 'text-zinc-700'}`}>
                  {s.title ?? (isPt ? 'Sem título' : 'Untitled')}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {timeAgo(s.last_activity_at)} · {s.message_count} {isPt ? 'msgs' : 'msgs'}
                </p>
              </button>
            )
          })
        )}
      </div>
    </>
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[500px] border border-zinc-200 rounded-2xl overflow-hidden bg-white">

      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-60 bg-zinc-50 border-r border-zinc-200">
        {sidebarBody}
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
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="text-xs font-medium text-zinc-400 hover:text-taime-700 transition-colors whitespace-nowrap shrink-0">
              {isPt ? 'Completar meu perfil' : 'Complete my profile'}
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-zinc-50">

          {messages.length === 0 && !loading && !hasHistory && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                             text-xs font-bold text-white shrink-0">T</div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                              bg-white border border-zinc-200 text-zinc-800 shadow-sm">
                {isPt ? WELCOME_PT : WELCOME_EN}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
                ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-taime-600 text-white'}`}>
                {msg.role === 'user' ? userInitials : 'T'}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-zinc-800 text-white rounded-tr-sm'
                  : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'}`}>
                {msg.role === 'user'
                  ? msg.content.split('\n').map((line, i) => (
                      <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
                    ))
                  : <AdvisorMarkdown content={msg.content} />}
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

        {/* Input */}
        <div className="border-t border-zinc-100 bg-white px-4 py-3">
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
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-zinc-300 mt-1.5 text-right">Shift+Enter para nova linha</p>
        </div>
      </div>
    </div>
  )
}
