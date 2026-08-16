'use client'

import { useState } from 'react'
import AdvisorOnboarding from '@/components/AdvisorOnboarding'
import AdvisorChat from '@/components/AdvisorChat'
import { useLocale } from '@/lib/useLocale'

interface Profile {
  company_name: string | null
  sector:       string | null
}

interface Props {
  userId:    string
  userName:  string | null
  userEmail: string | null
  profile:   Profile | null
  plan?:     string | null
  usage?:    { used: number; limit: number | null }
}

export default function AdvisorView({ userId, userName, userEmail, profile, plan, usage }: Props) {
  const [showProfileForm, setShowProfileForm] = useState(false)
  const { t } = useLocale()
  const O = t.advisorOnboarding

  // Perfil deixou de ser pre-requisito: o usuario entra direto no chat. O
  // formulario so aparece para quem ESCOLHE preencher de uma vez (link discreto
  // no header do chat). Ao salvar, recarrega para refletir o perfil no chat.
  if (showProfileForm) {
    return (
      <>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">{O.headerTitle}</h1>
            <p className="text-sm text-zinc-500">{O.headerDesc}</p>
          </div>
          <button
            onClick={() => setShowProfileForm(false)}
            className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors whitespace-nowrap mt-1">
            {O.backToChat}
          </button>
        </div>
        <AdvisorOnboarding userId={userId} onComplete={() => window.location.reload()} />
      </>
    )
  }

  return (
    <AdvisorChat
      userId={userId}
      userName={userName}
      userEmail={userEmail}
      profile={profile}
      plan={plan}
      usage={usage}
      onOpenProfile={() => setShowProfileForm(true)}
    />
  )
}
