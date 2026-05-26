'use client'

import { useState } from 'react'
import AdvisorOnboarding from '@/components/AdvisorOnboarding'
import AdvisorChat from '@/components/AdvisorChat'

interface Profile {
  company_name: string | null
  sector:       string | null
}

interface Props {
  userId:  string
  profile: Profile | null
}

export default function AdvisorView({ userId, profile }: Props) {
  const [hasProfile, setHasProfile] = useState(!!profile)
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(profile)

  function handleOnboardingComplete() {
    // Reload to get the saved profile from the server, then show chat
    window.location.reload()
  }

  if (!hasProfile || !currentProfile) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">Configurar Executive Advisor</h1>
          <p className="text-sm text-zinc-500">
            Compartilhe o contexto da sua empresa para receber orientação estratégica personalizada.
          </p>
        </div>
        <AdvisorOnboarding userId={userId} onComplete={handleOnboardingComplete} />
      </>
    )
  }

  return (
    <AdvisorChat userId={userId} profile={currentProfile} />
  )
}
