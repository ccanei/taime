'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'

export default function LogoutButton() {
  const router = useRouter()
  const { locale } = useLocale()

  async function handleLogout() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const label = locale === 'en' ? 'Log out' : 'Sair'

  return (
    <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
      {label}
    </button>
  )
}
