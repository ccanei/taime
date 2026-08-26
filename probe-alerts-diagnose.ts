#!/usr/bin/env npx ts-node
/* Diagnostico do dry-run de alertas: por que 0 eventos? Mostra, por plano real:
 * prefs do usuario, a JANELA de new_signal (trends indexadas desde a criacao do plano),
 * o ranking semantico do tema do plano (com e sem o limiar 0.42), e o estado de stalled. */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }
const DAY = 86400000

async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function rpc<T>(fn: string, args: any): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) }); if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function embed(t: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'text-embedding-3-small', input: t }) })
  return (await r.json()).data[0].embedding
}

async function main() {
  const now = Date.now()
  const plans = await get<any>('advisor_plans?status=eq.active&select=id,user_id,title,theme,phases,created_at,updated_at')
  const uids = [...new Set(plans.map(p => p.user_id))]
  const users = await get<any>(`users?id=in.(${uids.join(',')})&select=id,email,preferred_language,alert_new_signal,alert_stalled_action,alerts_muted`)
  const umap = new Map(users.map(u => [u.id, u]))

  // Total de embeddings e a extensao temporal do indice (contexto).
  const empAll = await get<any>('report_trend_embeddings?select=created_at&order=created_at.desc&limit=1')
  const empCount = await get<any>('report_trend_embeddings?select=id&limit=1')  // so p/ header (nao conta tudo)
  console.log(`Ultima indexacao (report_trend_embeddings.created_at): ${empAll[0]?.created_at ?? 'n/a'}\n`)

  for (const p of plans) {
    const u = umap.get(p.user_id)
    const lang = u.preferred_language === 'en' ? 'en' : 'pt'
    const theme = (p.theme || p.title || '').trim()
    console.log(`━━ plano ${p.id.slice(0, 8)} | ${u.email}`)
    console.log(`   tema: "${theme}"  | lang=${lang} | criado ${p.created_at.slice(0, 10)} | atualizado ${p.updated_at.slice(0, 10)}`)
    console.log(`   prefs: new_signal=${u.alert_new_signal} stalled=${u.alert_stalled_action} muted=${u.alerts_muted}`)

    // Janela new_signal: quantas trends foram indexadas DESDE a criacao do plano?
    const since = p.created_at
    const freshEmb = await get<any>(`report_trend_embeddings?created_at=gte.${encodeURIComponent(since)}&lang=eq.${lang}&select=id`)
    console.log(`   janela new_signal (indexadas desde ${since.slice(0, 10)}, lang ${lang}): ${freshEmb.length} chunk(s)`)

    // Ranking semantico do tema (SEM janela, SEM limiar) -> prova que o match funciona.
    const vec = await embed(theme)
    const wide = await rpc<any>('match_trend_chunks_since', { query_embedding: vec, since_ts: '1970-01-01', match_lang: lang, min_similarity: 0.0, match_count: 5 })
    console.log(`   top-5 do arquivo p/ este tema (sem janela/limiar):`)
    for (const m of wide) console.log(`     sim=${m.similarity.toFixed(3)} ${m.similarity >= 0.42 ? '>=0.42' : '<0.42 '} | ${m.period} #${m.rank} ${(m.category ?? m.theme_slug ?? '').slice(0, 28)}`)

    // Query REAL do new_signal (janela + limiar).
    const real = await rpc<any>('match_trend_chunks_since', { query_embedding: vec, since_ts: since, match_lang: lang, min_similarity: 0.42, match_count: 20 })
    console.log(`   -> new_signal REAL (desde criacao, sim>=0.42): ${real.length} match(es)`)

    // Stalled: idade da ultima atividade + acao pendente na fase atual.
    const ageDays = Math.floor((now - new Date(p.updated_at).getTime()) / DAY)
    const phases = p.phases ?? []
    let curIdx = phases.findIndex((ph: any) => (ph.actions ?? []).some((a: any) => a.status !== 'done'))
    if (curIdx === -1) curIdx = Math.max(0, phases.length - 1)
    const pend = (phases[curIdx]?.actions ?? []).find((a: any) => a.status !== 'done')
    console.log(`   stalled: parado ha ${ageDays}d (limiar 14d ${ageDays >= 14 ? 'ATINGIDO' : 'nao'}) | fase atual ${curIdx + 1} | acao pendente: ${pend ? '"' + pend.text.slice(0, 40) + '"' : 'nenhuma'}`)
    console.log('')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
