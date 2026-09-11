'use client'

import AdvisorChat from '@/components/AdvisorChat'

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

// O perfil (e maturidade, fatos, planos) vive agora na aba unificada /dashboard/empresa,
// linkada no header do chat e no painel lateral. O Advisor entra direto na conversa.
export default function AdvisorView({ userId, userName, userEmail, profile, plan, usage }: Props) {
  return (
    <AdvisorChat
      userId={userId}
      userName={userName}
      userEmail={userEmail}
      profile={profile}
      plan={plan}
      usage={usage}
    />
  )
}
