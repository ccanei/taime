import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const MAX_FIELD_CHARS = 200

const VALID_LANGUAGES = ['pt-BR', 'en'] as const
type ValidLanguage = typeof VALID_LANGUAGES[number]

interface UpdateBody {
  company?:            string | null
  job_title?:          string | null
  preferred_language?: string | null
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, MAX_FIELD_CHARS)
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: UpdateBody
  try {
    body = await req.json() as UpdateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // SOMENTE os 3 campos permitidos. Qualquer outra chave (email, full_name, etc.)
  // é silenciosamente ignorada — não fazemos pick com `...body`.
  const company   = trimOrNull(body.company)
  const job_title = trimOrNull(body.job_title)

  const lang = typeof body.preferred_language === 'string' ? body.preferred_language : null
  const preferred_language: ValidLanguage | null =
    lang && (VALID_LANGUAGES as readonly string[]).includes(lang) ? (lang as ValidLanguage) : null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  // Monta o payload: se preferred_language não veio válido, omite o campo
  // (mantém o valor atual no banco). Igual para company/job_title — null
  // limpa o campo de propósito (string vazia → null pelo trimOrNull).
  const patch: Record<string, unknown> = {
    company,
    job_title,
    updated_at: new Date().toISOString(),
  }
  if (preferred_language) {
    patch.preferred_language   = preferred_language
    patch.language_set_by_user = true
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
    method:  'PATCH',
    headers: {
      apikey:         serviceKey,
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify(patch),
  })

  if (!res.ok) {
    const dbErr = await res.text()
    console.error('account/update: PATCH falhou', res.status, dbErr.slice(0, 200))
    return NextResponse.json({ error: 'Erro ao salvar perfil' }, { status: 500 })
  }

  return NextResponse.json({ success: true, preferred_language: preferred_language ?? null })
}
