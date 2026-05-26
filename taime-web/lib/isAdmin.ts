import { createSupabaseService } from './supabase-server'

const FALLBACK_ADMIN = 'claudineicanei1@gmail.com'

export async function isAdmin(email: string): Promise<boolean> {
  try {
    const supabase = createSupabaseService()
    const { data, error } = await supabase
      .from('admins')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (error) return email.toLowerCase() === FALLBACK_ADMIN
    return !!data
  } catch {
    return email.toLowerCase() === FALLBACK_ADMIN
  }
}
