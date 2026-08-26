// Valida a logica do endpoint /api/trajectory contra o banco real.
import { readFileSync } from 'fs'

const env = readFileSync('taime-web/.env.local', 'utf8')
const get = (k: string) => env.split('\n').find(l => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') ?? ''
const URL = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_KEY')

const CURATED: [string, string[]][] = [
  ['Governanca de IA', ['governanca-ia', 'governanca-qualidade-dados-ia']],
  ['Agentes autonomos', ['ia-agentes-autonomos', 'sistemas-autonomos-logistica-ia']],
  ['IA e ciberseguranca', ['ia-ciberseguranca-corrida-armamentista', 'arquitetura-zero-trust-seguranca']],
  ['Computacao quantica', ['computacao-quantica-comercial', 'criptografia-pos-quantica-migracao']],
  ['Semicondutores', ['soberania-semicondutores-geopolitica']],
  ['IA financas', ['ia-servicos-financeiros', 'ia-generativa-servicos-financeiros']],
  ['Privacidade e dados', ['fragmentacao-global-privacidade-dados']],
  ['Energia', ['ia-energia-infraestrutura-sustentavel', 'recuperacao-verde-carbono-imperativo-operacional']],
]

async function rest(path: string) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<any[]>
}

async function main() {
  // published report ids + periods
  const reps = await rest('reports?status=eq.published&select=id,period&limit=2000')
  const periodById = new Map(reps.map(r => [r.id, r.period]))
  console.log(`published reports: ${reps.length}\n`)

  for (const [name, slugs] of CURATED) {
    const inList = slugs.map(s => `"${s}"`).join(',')
    const trends = await rest(`report_trends?theme_slug=in.(${inList})&select=report_id,rank,taime_score,title_pt_br`)
    const items = trends
      .filter(t => periodById.has(t.report_id))
      .map(t => ({ period: periodById.get(t.report_id) as string, rank: t.rank, score: t.taime_score }))
      .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : b.score - a.score))
    const years = [...new Set(items.map(i => i.period.slice(0, 4)))].sort()
    const first = items[0]
    console.log(`${name.padEnd(22)} trends=${String(trends.length).padStart(4)}  published-items=${String(items.length).padStart(4)}  anos=${years[0]}..${years[years.length-1]}  (${years.length} anos)  ex: ${first?.period} #${first?.rank} score ${first?.score}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
