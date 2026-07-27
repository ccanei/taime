import crypto from 'crypto'

// Helpers anti-abuso reutilizaveis (funil de cadastro/waitlist). Espelham o que
// o /ask ja faz, sem tocar no /ask. Turnstile + hash de IP + heuristica de
// gibberish (string aleatoria de bot).

function secret(): string {
  return process.env.ANON_ASK_COOKIE_SECRET
    ?? process.env.CRON_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? 'taime-anti-abuse-fallback'
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const first = fwd.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

// Hash do IP (nunca o IP cru). `ns` namespaceia por funil (ex.: 'waitlist:') para
// nao colidir com as contagens de outro endpoint que use a mesma tabela.
export function hashIp(ip: string, ns = ''): string {
  return crypto.createHmac('sha256', secret()).update(ns + ip).digest('hex')
}

// Verificacao server-side do Cloudflare Turnstile (mesma infra do /ask).
export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const s = process.env.TURNSTILE_SECRET_KEY
  if (!s) return false
  try {
    const body = new URLSearchParams()
    body.set('secret', s)
    body.set('response', token)
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    if (!res.ok) return false
    const j = await res.json() as { success?: boolean }
    return j.success === true
  } catch {
    return false
  }
}

// Heuristica CONSERVADORA: a string parece gibberish de bot (name/company)?
// So sinais fortes disparam; na duvida devolve false (nunca acusa a esmo). O uso
// e apenas evitar AUTO-aprovacao, deixando pending_review para decisao humana.
export function looksRandom(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim()
  if (s.length < 8 || /\s/.test(s)) return false            // curto ou com espaco: natural
  // Letras e digitos alternando: sinal forte de gibberish, independe da contagem
  // de letras (ex.: "j4k2n8x7q1").
  const digitLetterRuns = (s.match(/[a-z]\d|\d[a-z]/gi) ?? []).length
  if (digitLetterRuns >= 3) return true
  const letters = s.replace(/[^a-zA-Zà-úÀ-Ú]/g, '')
  if (letters.length < 6) return false
  const vowels = (letters.match(/[aeiouyàáâãéêíóôõúü]/gi) ?? []).length
  const vowelRatio = vowels / letters.length
  const longConsonantRun = /[bcdfghjklmnpqrstvwxz]{5,}/i.test(s)   // 5+ consoantes seguidas
  const highLen = s.length >= 12
  return (highLen && vowelRatio < 0.28) || longConsonantRun
}
