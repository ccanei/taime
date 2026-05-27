import { NextResponse } from 'next/server'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

interface SerperNewsItem {
  title?: string
  link?: string
  snippet?: string
  date?: string
}

interface ClassifiedSignal {
  title_pt:        string
  title_en:        string
  summary_pt:      string
  summary_en:      string
  category:        string
  relevance:       'high' | 'medium' | 'low'
  source_category: string
  url:             string
  published_at:    string | null
}

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
    const serviceKey   = process.env.SUPABASE_SERVICE_KEY ?? ''
    const serperKey    = process.env.SERPER_API_KEY ?? ''
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''

    // ── 1. Busca notícias via Serper das últimas 24h ────────────────────────
    const queries = [
      'AI artificial intelligence enterprise technology',
      'cloud computing infrastructure technology',
      'cybersecurity threat enterprise',
      'technology market business strategy',
    ]

    const articles: SerperNewsItem[] = []
    for (const q of queries) {
      const res = await fetch('https://google.serper.dev/news', {
        method: 'POST',
        headers: {
          'X-API-KEY':    serperKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q, num: 5, tbs: 'qdr:d' }),
      })
      if (res.ok) {
        const data = await res.json() as { news?: SerperNewsItem[] }
        articles.push(...(data.news ?? []))
      }
    }

    // Remove duplicatas por URL
    const seen = new Set<string>()
    const unique = articles.filter(a => {
      if (!a.link || seen.has(a.link)) return false
      seen.add(a.link)
      return true
    }).slice(0, 20)

    if (unique.length === 0) {
      return NextResponse.json({ success: true, count: 0 })
    }

    // ── 2. Classifica com Claude Haiku ──────────────────────────────────────
    const prompt = `You are a technology intelligence analyst.
For each article below, classify it and return JSON array.

Articles:
${unique.map((a, i) => `${i+1}. Title: ${a.title}\nSnippet: ${a.snippet ?? ''}\nURL: ${a.link}`).join('\n\n')}

Return a JSON array with objects:
{
  "title_pt": "Portuguese title",
  "title_en": "English title",
  "summary_pt": "2-line summary in Portuguese",
  "summary_en": "2-line summary in English",
  "category": one of: "IA","Cloud","Cybersecurity","Market","Infrastructure","Regulation","Fintech",
  "relevance": one of: "high","medium","low",
  "source_category": one of: "technology publication","research institute","consulting firm","venture capital firm","academic research center","regulatory body",
  "url": "original URL",
  "published_at": "ISO date or null"
}

Return ONLY the JSON array, no other text.`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      throw new Error(`Claude API error: ${claudeRes.status}`)
    }

    const claudeData = await claudeRes.json() as { content?: Array<{ text?: string }> }
    const text       = claudeData.content?.[0]?.text ?? '[]'

    let signals: ClassifiedSignal[] = []
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      signals = JSON.parse(clean) as ClassifiedSignal[]
    } catch {
      throw new Error('Failed to parse Claude response')
    }

    // Filtra apenas high e medium, top 10
    const filtered = signals
      .filter(s => s.relevance === 'high' || s.relevance === 'medium')
      .slice(0, 10)

    // ── 3. Substitui radar_signals: deleta antigos e insere novos ───────────
    // PostgREST exige um filtro em DELETE para evitar truncate acidental.
    // `id=not.is.null` cobre todas as linhas.
    await fetch(`${supabaseUrl}/rest/v1/radar_signals?id=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey:         serviceKey,
        Authorization:  `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (filtered.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/radar_signals`, {
        method: 'POST',
        headers: {
          apikey:         serviceKey,
          Authorization:  `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal',
        },
        body: JSON.stringify(
          filtered.map(s => ({
            title_pt:        s.title_pt,
            title_en:        s.title_en,
            summary_pt:      s.summary_pt,
            summary_en:      s.summary_en,
            category:        s.category,
            relevance:       s.relevance,
            source_category: s.source_category,
            url:             s.url,
            published_at:    s.published_at,
            collected_at:    new Date().toISOString(),
          }))
        ),
      })
    }

    return NextResponse.json({ success: true, count: filtered.length })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Radar cron error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
