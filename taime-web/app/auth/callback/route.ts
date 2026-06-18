import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { detectLocale } from '@/lib/i18n'

// ── Boas-vindas do plano free ────────────────────────────────────────────────
// Disparado na primeira sessão de um usuário free, aqui no callback. Por decisão
// de produto NÃO extraímos helper compartilhado agora: replicamos inline o estilo
// do userEmailHtml do /api/admin/waitlist (fundo #0F172A, Georgia, mesmas
// opacidades, container 600px) e o padrão de envio do sendEmail (Resend).
const WELCOME_FROM      = 'TAIME | John <johnb@taime.tech>'
const WELCOME_DASH_URL  = 'https://www.taime.tech/dashboard'

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function welcomeEmailHtml(firstNameRaw: string, lang: 'pt-BR' | 'en'): string {
  const first = escapeHtml((firstNameRaw || '').trim().split(/\s+/)[0] || '')
  const pt = lang === 'pt-BR'

  const greeting = pt
    ? (first ? `Olá, ${first},` : 'Olá,')
    : (first ? `Hello, ${first},` : 'Hello,')

  const p1 = pt
    ? 'Sua conta TAIME está ativa. Você já pode acessar a inteligência estratégica em tecnologia que transforma sinais globais em decisões estruturadas.'
    : 'Your TAIME account is active. You can now access the strategic technology intelligence that turns global signals into structured decisions.'
  const p2 = pt
    ? 'No seu plano gratuito, você tem acesso a dois relatórios completos por mês, com cobertura do último ano. Cada relatório traz o panorama TYPE, ACT, IMPACT, MOVE, EXIT e a leitura temporal THEN, NOW, NEXT que orienta a próxima decisão.'
    : 'On your free plan, you have access to two complete reports per month, with coverage of the most recent year. Each report carries the TYPE, ACT, IMPACT, MOVE, EXIT view and the THEN, NOW, NEXT temporal reading that guides your next decision.'
  const p3 = pt
    ? 'Comece pelo seu painel e explore os relatórios mais recentes. Quando quiser ampliar a profundidade temporal e a cobertura, os planos superiores estarão à sua disposição.'
    : 'Start from your dashboard and explore the latest reports. When you are ready to extend temporal depth and coverage, the higher plans will be available to you.'
  const p4 = pt ? 'Boa leitura.' : 'Enjoy the read.'
  const cta = pt ? 'Acessar o painel' : 'Open your dashboard'
  const sign = pt ? 'Equipe TAIME' : 'The TAIME team'

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
    style="background-color:#0F172A;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color:#0F172A;max-width:600px;">
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <span style="font-size:22px;font-weight:bold;
                color:#ffffff;letter-spacing:4px;
                font-family:Georgia,serif;">TAIME</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <h1 style="margin:0;font-size:24px;color:#ffffff;
                font-family:Georgia,serif;font-weight:bold;">
                ${greeting}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                ${p1}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                ${p2}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                ${p3}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <a href="${WELCOME_DASH_URL}"
                style="display:inline-block;background-color:#ffffff;
                color:#0F172A;text-decoration:none;font-weight:bold;
                font-size:15px;font-family:Georgia,serif;
                padding:12px 28px;border-radius:4px;">
                ${cta}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                ${p4}<br/>${sign}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;
              border-top:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0;font-size:12px;
                color:rgba(255,255,255,0.4);font-family:Georgia,serif;">
                TAIME · Strategic Technology Intelligence<br/>
                contact@taime.tech · taime.tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendWelcomeEmail(to: string, html: string, subject: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.error('auth/callback: missing RESEND_API_KEY')
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: WELCOME_FROM,
      reply_to: 'johnb@taime.tech',
      to,
      subject,
      html,
    }),
  }).catch((e) => console.error('Resend error (welcome):', e))
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any))
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // ── Enriquecimento do perfil (best-effort, jamais bloqueia o login).
      //    Trigger handle_new_user já inseriu a row em public.users com
      //    (id, email, full_name). Aqui complementamos company / job_title /
      //    preferred_language a partir do user_metadata que foi gravado pelo
      //    free-signup no /login (signInWithOtp options.data).
      //
      //    Regras COALESCE: só preenchemos campos onde o perfil atual está
      //    vazio. Nunca rebaixamos quem foi aprovado manualmente nem
      //    sobrescrevemos uma escolha consciente do usuário.
      //
      //    Idioma mantém a hierarquia anterior: language_set_by_user=true
      //    é intocável; com false, metadata vence detecção de cookie, que
      //    vence default 'pt-BR'.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const sessionDetected = detectLocale(cookieStore.get('taime-locale')?.value)
          const sessionLocale: 'pt-BR' | 'en' = sessionDetected === 'en' ? 'en' : 'pt-BR'

          const meta = (user.user_metadata ?? {}) as Record<string, unknown>
          const pickStr = (v: unknown): string | null =>
            typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
          const metaCompany  = pickStr(meta.company)
          const metaJobTitle = pickStr(meta.job_title)
          const rawMetaLang  = typeof meta.preferred_language === 'string' ? meta.preferred_language : ''
          const metaLang: 'pt-BR' | 'en' | null =
            rawMetaLang === 'pt-BR' || rawMetaLang === 'en' ? rawMetaLang : null

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
          const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
          if (supabaseUrl && serviceKey) {
            const headers = {
              apikey:        serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            }
            let profilePreferredLang: string | null = null
            const lookupRes = await fetch(
              `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=company,job_title,preferred_language,language_set_by_user&limit=1`,
              { headers },
            )
            if (lookupRes.ok) {
              const rows = await lookupRes.json() as Array<{
                company:              string | null
                job_title:            string | null
                preferred_language:   string | null
                language_set_by_user: boolean | null
              }>
              const profile = rows[0]
              if (profile) {
                profilePreferredLang = profile.preferred_language
                const patch: Record<string, string> = {}

                // COALESCE: só preenche se metadata trouxe valor E o perfil
                // atual está vazio. Quem aprovou manualmente fica preservado.
                if (metaCompany  && !profile.company)   patch.company   = metaCompany
                if (metaJobTitle && !profile.job_title) patch.job_title = metaJobTitle

                // Idioma: nunca toca em language_set_by_user=true.
                if (profile.language_set_by_user === false) {
                  const target: 'pt-BR' | 'en' | null =
                    metaLang ??
                    (profile.preferred_language === 'pt-BR' && sessionLocale === 'en' ? 'en' : null)
                  if (target && target !== profile.preferred_language) {
                    patch.preferred_language = target
                  }
                }

                if (Object.keys(patch).length > 0) {
                  await fetch(
                    `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
                    {
                      method: 'PATCH',
                      headers: { ...headers, Prefer: 'return=minimal' },
                      body:    JSON.stringify(patch),
                    },
                  )
                }
              }
            }

            // ── Boas-vindas do free, apenas na primeira sessão ──────────────
            //    Controle de reenvio SEM coluna nova no banco: usamos a flag
            //    welcome_email_sent dentro do user_metadata (auth.users). Como
            //    é metadata de autenticação, persiste entre logins e não exige
            //    migration. Marcamos logo após o envio para evitar reenvio em
            //    logins concorrentes.
            if (meta.welcome_email_sent !== true) {
              // FREE via subscription: enviamos quando o plano NÃO é
              // essential/strategic. Ausência de subscription ativa também
              // conta como free (convenção do app: null = free), cobrindo o
              // signup recém-criado que ainda não tenha row de subscription.
              let plan: string | null = null
              const subRes = await fetch(
                `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${user.id}&status=eq.active&select=plan&order=created_at.desc&limit=1`,
                { headers },
              )
              if (subRes.ok) {
                const subRows = await subRes.json() as Array<{ plan: string | null }>
                plan = subRows[0]?.plan ?? null
              }
              const isFreePlan = plan !== 'essential' && plan !== 'strategic'

              if (isFreePlan) {
                const lang: 'pt-BR' | 'en' =
                  metaLang ??
                  (profilePreferredLang === 'en' ? 'en' : 'pt-BR')
                const fullName = pickStr(meta.full_name) ?? ''
                const subject = lang === 'pt-BR' ? 'Bem-vindo ao TAIME' : 'Welcome to TAIME'

                if (user.email) {
                  await sendWelcomeEmail(user.email, welcomeEmailHtml(fullName, lang), subject)
                }

                // Marca como enviado preservando o metadata existente
                // (spread) para não perder company/job_title/preferred_language.
                await fetch(
                  `${supabaseUrl}/auth/v1/admin/users/${user.id}`,
                  {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                      user_metadata: { ...meta, welcome_email_sent: true },
                    }),
                  },
                )
              }
            }
          }
        }
      } catch (e) {
        console.error('Auth callback: profile enrichment failed (non-blocking):', e)
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
