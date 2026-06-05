import { NextResponse } from 'next/server'
import { createSupabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>
}

interface MatchRow {
  id:          string
  title_pt_br: string | null
  title_en:    string | null
  period:      string
  similarity:  number
}

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const EMBED_MODEL      = 'text-embedding-3-small'
const DEFAULT_LIMIT    = 10
const MAX_LIMIT        = 25
const MAX_QUERY_CHARS  = 1_000

export async function POST(req: Request) {
  let body: { query?: string; limit?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = (body.query ?? '').trim()
  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json({ error: `query too long (max ${MAX_QUERY_CHARS} chars)` }, { status: 400 })
  }

  const limit = Math.min(Math.max(Math.trunc(body.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('search: OPENAI_API_KEY missing')
    return NextResponse.json({ error: 'Search not configured' }, { status: 500 })
  }

  // 1) Gera embedding da query
  let vec: number[]
  try {
    const r = await fetch(OPENAI_EMBED_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    })
    if (!r.ok) {
      const errBody = await r.text()
      console.error('search: openai error', r.status, errBody.slice(0, 200))
      return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
    }
    const json = await r.json() as OpenAIEmbeddingResponse
    const candidate = json.data?.[0]?.embedding
    if (!Array.isArray(candidate) || candidate.length !== 1536) {
      console.error('search: invalid embedding shape', { length: candidate?.length })
      return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
    }
    vec = candidate
  } catch (e) {
    console.error('search: openai exception', e)
    return NextResponse.json({ error: 'Embedding failed' }, { status: 500 })
  }

  // 2) RPC match_reports
  try {
    const supabase = createSupabaseService()
    const { data, error } = await supabase.rpc('match_reports', {
      query_embedding: vec,
      match_count:     limit,
    })

    if (error) {
      console.error('search: rpc error', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    return NextResponse.json({ results: (data ?? []) as MatchRow[] })
  } catch (e) {
    console.error('search: rpc exception', e)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
