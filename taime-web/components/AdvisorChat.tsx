'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'

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

interface Props {
  userId:  string
  profile: AdvisorProfile
}

const COMING_SOON_PT = `Olá! Sou o TAIME Executive Advisor. Estou sendo configurado para oferecer consultoria estratégica personalizada com base no seu perfil e na inteligência dos relatórios TAIME. Em breve estarei disponível para te ajudar a transformar sinais tecnológicos em decisões estratégicas para sua empresa. Fique atento — você será notificado quando o Advisor estiver ativo.`

const COMING_SOON_EN = `Hello! I'm the TAIME Executive Advisor. I'm being configured to provide personalized strategic advisory based on your profile and TAIME report intelligence. I'll be available soon to help you transform technology signals into strategic decisions for your organization. Stay tuned — you'll be notified when the Advisor is active.`

function generateSessionId(): string {
  return crypto.randomUUID()
}

export default function AdvisorChat({ userId, profile }: Props) {
  const { locale }   = useLocale()
  const isPt         = locale === 'pt'
  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [sessionId,  setSessionId]  = useState<string>('')
  const [hasHistory, setHasHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Load last session's messages on mount
  useEffect(() => {
    async function loadHistory() {
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

        const { data: msgs } = await supabase
          .from('advisory_memory')
          .select('id, role, content, created_at')
          .eq('user_id', userId)
          .eq('session_id', sid)
          .order('created_at', { ascending: true })
          .limit(30)

        if (msgs && msgs.length > 0) {
          setMessages(msgs as Message[])
          setHasHistory(true)
        } else {
          setSessionId(generateSessionId())
          setHasHistory(false)
        }
      } else {
        setSessionId(generateSessionId())
        setHasHistory(false)
      }
    }
    loadHistory()
  }, [userId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function newSession() {
    setSessionId(generateSessionId())
    setMessages([])
    inputRef.current?.focus()
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

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-white">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">TAIME Executive Advisor</h2>
          {profile.company_name && (
            <p className="text-xs text-zinc-400">{profile.company_name}{profile.sector ? ` · ${profile.sector}` : ''}</p>
          )}
        </div>
        <button
          onClick={newSession}
          className="text-xs text-zinc-400 hover:text-zinc-700 border border-zinc-200
                     hover:border-zinc-300 px-3 py-1.5 rounded-lg transition-colors">
          Novo contexto
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-zinc-50">

        {messages.length === 0 && !loading && !hasHistory && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-taime-600 flex items-center justify-center
                           text-xs font-bold text-white shrink-0">T</div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
                            bg-white border border-zinc-200 text-zinc-800 shadow-sm">
              {isPt ? COMING_SOON_PT : COMING_SOON_EN}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
              ${msg.role === 'user'
                ? 'bg-zinc-800 text-white'
                : 'bg-taime-600 text-white'}`}>
              {msg.role === 'user' ? 'U' : 'T'}
            </div>

            {/* Bubble */}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-zinc-800 text-white rounded-tr-sm'
                : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm shadow-sm'}`}>
              {msg.content.split('\n').map((line, i) => (
                <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
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
              !hasHistory
                ? (isPt ? 'Advisor em breve disponível...' : 'Advisor coming soon...')
                : (isPt ? 'Pergunte sobre tendências, estratégia ou decisões tecnológicas... (Enter para enviar)'
                        : 'Ask about trends, strategy or technology decisions... (Enter to send)')
            }
            rows={2}
            disabled={loading || !hasHistory}
            className="flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-2.5 text-sm
                       text-zinc-900 placeholder:text-zinc-400 outline-none
                       focus:ring-2 focus:ring-taime-600 focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || !hasHistory}
            className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-zinc-300 mt-1.5 text-right">Shift+Enter para nova linha</p>
      </div>
    </div>
  )
}
