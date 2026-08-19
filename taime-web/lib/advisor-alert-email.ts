// Templates de email dos alertas por evento (Fase 3.1). Sobrio, coerente com a marca,
// no idioma do usuario. DISCIPLINA DE CONTEUDO: um email NUNCA expoe o conteudo da
// analise, apenas o TEMA e o porque importar (mesma regra do teaser de profundidade).
// Sem travessao. Usado pelo job detect-advisor-alerts.ts.

export type AlertLang = 'pt' | 'en'

const BRAND = '#1D4ED8'
const INK = '#18181b'
const MUTE = '#71717a'
const FAINT = '#a1a1aa'
const BORDER = '#e4e4e7'
const BG = '#f4f5f7'

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function layout(o: {
  lang: AlertLang; preheader: string; heading: string; bodyHtml: string
  ctaLabel: string; ctaUrl: string; footerReason: string; optoutUrl: string
}): string {
  const optoutLabel = o.lang === 'pt' ? 'Parar de receber estes alertas' : 'Stop receiving these alerts'
  const settingsLabel = o.lang === 'pt' ? 'ajustar nas preferencias da conta' : 'adjust in account settings'
  const settingsUrl = 'https://www.taime.tech/conta'
  return `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>TAIME</title></head>
<body style="margin:0;padding:0;background:${BG};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:22px 28px 0 28px;">
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">TAIME</span>
        <span style="font-size:12px;color:${FAINT};margin-left:8px;">Executive Advisor</span>
      </td></tr>
      <tr><td style="padding:16px 28px 4px 28px;">
        <h1 style="margin:0;font-size:19px;line-height:1.35;font-weight:700;color:${INK};">${esc(o.heading)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 4px 28px;font-size:14px;line-height:1.6;color:${MUTE};">
        ${o.bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 28px 8px 28px;">
        <a href="${esc(o.ctaUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${esc(o.ctaLabel)}</a>
      </td></tr>
      <tr><td style="padding:18px 28px 22px 28px;border-top:1px solid ${BORDER};margin-top:12px;">
        <p style="margin:14px 0 6px 0;font-size:12px;line-height:1.5;color:${FAINT};">${esc(o.footerReason)} ${o.lang === 'pt' ? 'Você pode' : 'You can'} <a href="${esc(settingsUrl)}" style="color:${MUTE};">${esc(settingsLabel)}</a>.</p>
        <p style="margin:0;font-size:12px;line-height:1.5;">
          <a href="${esc(o.optoutUrl)}" style="color:${MUTE};text-decoration:underline;">${esc(optoutLabel)}</a>
        </p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0 0;font-size:11px;color:${FAINT};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">TAIME Executive Advisor</p>
  </td></tr>
</table>
</body></html>`
}

export function renderNewSignalEmail(o: {
  lang: AlertLang; planTheme: string; phaseLabel: string | null; ctaUrl: string; optoutUrl: string
}): { subject: string; html: string } {
  const theme = o.planTheme
  if (o.lang === 'pt') {
    const subject = `Uma análise nova toca o seu plano de ${theme}`
    const body = `
      <p style="margin:0 0 10px 0;">Saiu uma análise nova no arquivo TAIME que se conecta ao tema que você acompanha no seu plano.</p>
      ${o.phaseLabel ? `<p style="margin:0 0 10px 0;">Isso toca diretamente a <strong style="color:${INK};">${esc(o.phaseLabel)}</strong> do seu plano.</p>` : ''}
      <p style="margin:0;">Vale entender o que muda antes de avançar. Abra a conversa no Advisor com a pergunta já pronta e veja a leitura completa lá dentro.</p>`
    return { subject, html: layout({ lang: 'pt', preheader: subject, heading: `Uma análise nova toca o seu plano`, bodyHtml: body, ctaLabel: 'Ver no Advisor', ctaUrl: o.ctaUrl, footerReason: 'Você recebe isto porque ativou alertas de sinal novo.', optoutUrl: o.optoutUrl }) }
  }
  const subject = `A new analysis touches your ${theme} plan`
  const body = `
    <p style="margin:0 0 10px 0;">A new analysis just landed in the TAIME archive, and it connects to the theme you track in your plan.</p>
    ${o.phaseLabel ? `<p style="margin:0 0 10px 0;">It touches your <strong style="color:${INK};">${esc(o.phaseLabel)}</strong> directly.</p>` : ''}
    <p style="margin:0;">Worth understanding what changes before you move. Open the conversation in the Advisor with the question ready and read the full take there.</p>`
  return { subject, html: layout({ lang: 'en', preheader: subject, heading: `A new analysis touches your plan`, bodyHtml: body, ctaLabel: 'Open in the Advisor', ctaUrl: o.ctaUrl, footerReason: 'You are getting this because you turned on new signal alerts.', optoutUrl: o.optoutUrl }) }
}

export function renderStalledEmail(o: {
  lang: AlertLang; planTitle: string; phaseLabel: string | null; actionText: string; daysStalled: number; ctaUrl: string; optoutUrl: string
}): { subject: string; html: string } {
  if (o.lang === 'pt') {
    const subject = `Uma ação do seu plano está parada`
    const body = `
      <p style="margin:0 0 10px 0;">Uma ação${o.phaseLabel ? ` da <strong style="color:${INK};">${esc(o.phaseLabel)}</strong>` : ''} do seu plano "${esc(o.planTitle)}" está pendente há ${o.daysStalled} dias:</p>
      <p style="margin:0 0 10px 0;padding:10px 12px;background:${BG};border-radius:8px;color:${INK};font-size:13px;">${esc(o.actionText)}</p>
      <p style="margin:0;">Se ainda faz sentido, vale retomar. Se não, ajuste o plano. Sem pressa, só um lembrete de parceiro.</p>`
    return { subject, html: layout({ lang: 'pt', preheader: subject, heading: `Uma ação do seu plano está parada`, bodyHtml: body, ctaLabel: 'Abrir o plano', ctaUrl: o.ctaUrl, footerReason: 'Você recebe isto porque ativou lembretes de ação parada.', optoutUrl: o.optoutUrl }) }
  }
  const subject = `An action in your plan has stalled`
  const body = `
    <p style="margin:0 0 10px 0;">An action${o.phaseLabel ? ` in your <strong style="color:${INK};">${esc(o.phaseLabel)}</strong>` : ''} in your plan "${esc(o.planTitle)}" has been pending for ${o.daysStalled} days:</p>
    <p style="margin:0 0 10px 0;padding:10px 12px;background:${BG};border-radius:8px;color:${INK};font-size:13px;">${esc(o.actionText)}</p>
    <p style="margin:0;">If it still matters, worth picking it up. If not, adjust the plan. No pressure, just a partner's nudge.</p>`
  return { subject, html: layout({ lang: 'en', preheader: subject, heading: `An action in your plan has stalled`, bodyHtml: body, ctaLabel: 'Open the plan', ctaUrl: o.ctaUrl, footerReason: 'You are getting this because you turned on stalled action reminders.', optoutUrl: o.optoutUrl }) }
}
