#!/usr/bin/env npx ts-node
/*
 * switch-2026-reanalysis.ts  -  A VIRADA EM LOTE das 11 quinzenas de 2026.
 *
 * Promove os reports-SOMBRA da re-analise (pending_review) para os periodos REAIS,
 * arquivando (nunca deletando) os reports antigos. RODA EM DRY-RUN POR PADRAO: mostra
 * o plano completo e NAO altera nada. So muta com --execute.
 *
 * Por periodo (real, sombra), na ordem, cada passo idempotente e guardado pelo journal:
 *   1. ARQUIVA os reports antigos do periodo real (status='archived', nunca delete).
 *      Captura is_public (report) e is_hero (trends) p/ o relatorio de curadoria orfa.
 *   2. MOVE a sombra -> real: reports (period + period_label/start/end/type recalculados,
 *      report_number remapeado p/ nao colidir com os arquivados), signal_clusters e signals
 *      (UPDATE period). As trends acompanham via report_id (FK), sem mexer.
 *   3. PUBLICA os reports movidos (status='published', published_at).
 *   4. DE-INDEXA o Advisor: apaga report_trend_embeddings dos reports arquivados (indice
 *      derivado, regeneravel), garantindo que as trends antigas saem da busca.
 *   5. Marca o periodo como concluido no journal.
 * Depois do loop:
 *   6. Gera embeddings das trends novas (generate-trend-embeddings.ts + generate-embeddings.ts),
 *      idempotente por (trend_id, lang) / (report embedding IS NULL).
 *   7. Dispara revalidateReportSurfaces via POST protegido (se REVALIDATE_URL/SECRET setados),
 *      senao instrui (ISR revalidate=300s ja e a rede de seguranca).
 *   8. Reporta os flags de curadoria orfaos (is_public / is_hero em reports arquivados).
 *
 * Idempotente e retomavel: o journal switch-2026-progress.json e o estado de retomada.
 * Se falhar no periodo N, re-rodar continua dali (periodos OK sao pulados). NAO APAGUE o journal.
 *
 * Uso:
 *   npx ts-node switch-2026-reanalysis.ts                 # DRY-RUN (plano completo, nada muda)
 *   npx ts-node switch-2026-reanalysis.ts --execute       # aplica de fato
 *   npx ts-node switch-2026-reanalysis.ts --execute --only 2026-03-01   # so um periodo real
 *   npx ts-node switch-2026-reanalysis.ts --execute --skip-embeddings   # nao roda os embeddings
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { parsePeriod } from './period-utils'

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }

const EXECUTE = process.argv.includes('--execute')
const SKIP_EMB = process.argv.includes('--skip-embeddings')
function parseOnly(): string {
  const eq = process.argv.find(a => a.startsWith('--only='))
  if (eq) return eq.split('=')[1] ?? ''
  const i = process.argv.indexOf('--only')
  return i >= 0 ? (process.argv[i + 1] ?? '') : ''
}
const ONLY = parseOnly()
const JOURNAL = 'switch-2026-progress.json'
const DRY = !EXECUTE

// Pares REAL:SOMBRA (11 quinzenas magras de 2026). Sombra = dia 08/23.
const PAIRS: Array<[string, string]> = [
  ['2026-01-01', '2026-01-08'], ['2026-01-16', '2026-01-23'], ['2026-02-01', '2026-02-08'],
  ['2026-02-16', '2026-02-23'], ['2026-03-01', '2026-03-08'], ['2026-03-16', '2026-03-23'],
  ['2026-04-01', '2026-04-08'], ['2026-04-16', '2026-04-23'], ['2026-05-01', '2026-05-08'],
  ['2026-05-16', '2026-05-23'], ['2026-06-01', '2026-06-08'],
]

interface Rep { id: string; report_number: number; status: string; is_public: boolean | null; title_pt_br: string | null }
interface Trend { id: string; rank: number; is_hero: boolean | null; title_pt_br: string | null }
interface PeriodJournal {
  archived?: { ids: string[]; publicIds: string[]; heroTrends: Array<{ reportId: string; reportNumber: number; trendId: string; rank: number; title: string | null }> }
  moved?: { promotedIds: string[]; reportNumbers: number[]; clustersMoved: number; signalsMoved: number }
  published?: boolean
  deindexed?: { deletedEmbeddingRows: number }
  done?: boolean
}
type Journal = { periods: Record<string, PeriodJournal>; embeddingsGenerated?: boolean; revalidated?: boolean }

function loadJournal(): Journal { return existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : { periods: {} } }
function saveJournal(j: Journal) { if (!DRY) writeFileSync(JOURNAL, JSON.stringify(j, null, 2)) }

async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function count(p: string): Promise<number> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return parseInt((r.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10) }
async function patch(path: string, body: unknown): Promise<number> {
  if (DRY) return 0
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`PATCH ${path}: ${r.status} ${await r.text()}`)
  const rows = await r.json() as unknown[]; return rows.length
}
async function del(path: string): Promise<number> {
  if (DRY) return 0
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=representation' } })
  if (!r.ok) throw new Error(`DELETE ${path}: ${r.status} ${await r.text()}`)
  const rows = await r.json() as unknown[]; return rows.length
}
function fmtDate(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const tag = () => (DRY ? '[DRY-RUN] ' : '[EXECUTE] ')

async function heroTrendsOf(reportId: string): Promise<Trend[]> {
  return get<Trend>(`report_trends?report_id=eq.${reportId}&is_hero=eq.true&select=id,rank,is_hero,title_pt_br`)
}

async function switchPeriod(real: string, shadow: string, j: Journal): Promise<'done' | 'skipped-empty'> {
  const pj: PeriodJournal = j.periods[real] ?? {}
  j.periods[real] = pj
  if (pj.done) { console.log(`  ${real}: ja concluido (journal). Pulando.`); return 'done' }

  const info = parsePeriod(real)
  // So promove reports-sombra JA VALIDADOS (pending_review). Nunca um 'generating'/'draft'
  // mid-pipeline nem um 'rejected'. A re-analise deixa tudo em pending_review (NO_AUTO_PUBLISH).
  const shadowReps = await get<Rep>(`reports?period=eq.${shadow}&status=eq.pending_review&select=id,report_number,status,is_public,title_pt_br&order=report_number.asc`)

  // SEGURANCA: so arquiva o antigo se ha substituto pronto na sombra. Sem isso, uma
  // execucao prematura (batch ainda rodando) deixaria o periodo real SEM report publico.
  if (shadowReps.length === 0 && !pj.archived) {
    console.log(`  ! ${shadow}: sombra sem reports (nada a promover). NAO arquiva o antigo. Pulando periodo.`)
    return 'skipped-empty'
  }

  // ── 1) ARQUIVAR os antigos do periodo real ──────────────────────────────────
  if (!pj.archived) {
    // "antigos" = tudo que ja esta no periodo real ANTES de mover a sombra.
    const oldReps = await get<Rep>(`reports?period=eq.${real}&status=neq.archived&status=neq.rejected&select=id,report_number,status,is_public,title_pt_br&order=report_number.asc`)
    const heroTrends: NonNullable<PeriodJournal['archived']>['heroTrends'] = []
    for (const r of oldReps) for (const t of await heroTrendsOf(r.id)) heroTrends.push({ reportId: r.id, reportNumber: r.report_number, trendId: t.id, rank: t.rank, title: t.title_pt_br })
    const publicIds = oldReps.filter(r => r.is_public).map(r => r.id)
    console.log(`  ${tag()}1) ARQUIVAR ${oldReps.length} report(s) antigo(s) de ${real}: ${oldReps.map(r => `#${r.report_number}[${r.status}${r.is_public ? ',PUB' : ''}]`).join(' ') || '(nenhum)'}`)
    if (heroTrends.length) console.log(`        curadoria orfa: ${heroTrends.length} trend(s) is_hero, ${publicIds.length} report(s) is_public`)
    if (oldReps.length) await patch(`reports?id=in.(${oldReps.map(r => r.id).join(',')})`, { status: 'archived' })
    pj.archived = { ids: oldReps.map(r => r.id), publicIds, heroTrends }
    saveJournal(j)
  } else console.log(`  = 1) arquivamento ja feito (${pj.archived.ids.length} reports).`)

  // ── 2) MOVER a sombra -> real ────────────────────────────────────────────────
  if (!pj.moved) {
    // base = maior report_number ja existente no periodo real (inclui arquivados) p/ evitar colisao no UNIQUE(period, report_number)
    const atReal = await get<{ report_number: number }>(`reports?period=eq.${real}&select=report_number&order=report_number.desc&limit=1`)
    const base = atReal.length ? atReal[0].report_number : 0
    const promotedIds: string[] = []; const reportNumbers: number[] = []
    console.log(`  ${tag()}2) MOVER ${shadowReps.length} report(s) da sombra ${shadow} -> ${real} (period_label="${info.labelPt}", report_number ${base + 1}..${base + shadowReps.length})`)
    for (let i = 0; i < shadowReps.length; i++) {
      const r = shadowReps[i]; const newNum = base + 1 + i
      await patch(`reports?id=eq.${r.id}`, {
        period: real, period_label: info.labelPt, period_type: info.type,
        period_start: info.key, period_end: fmtDate(info.end), report_number: newNum,
      })
      promotedIds.push(r.id); reportNumbers.push(newNum)
    }
    const nClusters = await count(`signal_clusters?period=eq.${shadow}&select=id`)
    const nSignals = await count(`signals?period=eq.${shadow}&select=id`)
    console.log(`  ${tag()}   mover ${nClusters} cluster(s) e ${nSignals} signal(is) ${shadow} -> ${real} (UPDATE period)`)
    const cMoved = await patch(`signal_clusters?period=eq.${shadow}`, { period: real })
    const sMoved = await patch(`signals?period=eq.${shadow}`, { period: real })
    pj.moved = { promotedIds, reportNumbers, clustersMoved: DRY ? nClusters : cMoved, signalsMoved: DRY ? nSignals : sMoved }
    saveJournal(j)
  } else console.log(`  = 2) move ja feito (${pj.moved.promotedIds.length} reports, ${pj.moved.clustersMoved} clusters, ${pj.moved.signalsMoved} signals).`)

  // ── 3) PUBLICAR os movidos ───────────────────────────────────────────────────
  if (!pj.published) {
    console.log(`  ${tag()}3) PUBLICAR ${pj.moved!.promotedIds.length} report(s) movido(s) (status=published, published_at)`)
    if (pj.moved!.promotedIds.length) await patch(`reports?id=in.(${pj.moved!.promotedIds.join(',')})`, { status: 'published', published_at: new Date().toISOString() })
    pj.published = true; saveJournal(j)
  } else console.log(`  = 3) publicacao ja feita.`)

  // ── 4) DE-INDEXAR Advisor: apaga embeddings das trends dos reports arquivados ─
  if (!pj.deindexed) {
    let deleted = 0
    if (pj.archived!.ids.length) {
      const n = await count(`report_trend_embeddings?report_id=in.(${pj.archived!.ids.join(',')})&select=trend_id`)
      console.log(`  ${tag()}4) DE-INDEXAR Advisor: apagar ${n} embedding(s) de trend dos ${pj.archived!.ids.length} report(s) arquivado(s)`)
      deleted = await del(`report_trend_embeddings?report_id=in.(${pj.archived!.ids.join(',')})`)
    } else console.log(`  ${tag()}4) DE-INDEXAR: nenhum report arquivado; nada a apagar.`)
    pj.deindexed = { deletedEmbeddingRows: DRY ? 0 : deleted }
    saveJournal(j)
  } else console.log(`  = 4) de-index ja feito (${pj.deindexed.deletedEmbeddingRows} rows).`)

  pj.done = true; saveJournal(j)
  return 'done'
}

function runEmbeddings() {
  for (const script of ['generate-trend-embeddings.ts', 'generate-embeddings.ts']) {
    if (DRY) { console.log(`  ${tag()}rodaria: npx ts-node ${script}`); continue }
    console.log(`  [EXECUTE] npx ts-node ${script} ...`)
    execSync(`npx ts-node ${script}`, { stdio: 'inherit' })
  }
}

async function triggerRevalidate() {
  const url = process.env.REVALIDATE_URL, secret = process.env.REVALIDATE_SECRET
  if (!url || !secret) {
    console.log(`  ${tag()}revalidacao: REVALIDATE_URL/REVALIDATE_SECRET nao setados.`)
    console.log(`        As superficies publicas usam ISR revalidate=300s (rede de seguranca): atualizam em ate 5 min.`)
    console.log(`        Para forcar na hora, faca deploy da rota /api/admin/revalidate-reports e rode com REVALIDATE_URL/SECRET.`)
    return
  }
  if (DRY) { console.log(`  ${tag()}faria POST ${url} (Bearer REVALIDATE_SECRET) p/ revalidateReportSurfaces`); return }
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: '{}' })
  console.log(`  [EXECUTE] POST ${url} -> ${r.status} ${await r.text()}`)
}

async function main() {
  if (!SUPA || !SKEY) { console.error('SUPABASE_URL/SUPABASE_SERVICE_KEY faltando'); process.exit(1) }
  const pairs = ONLY ? PAIRS.filter(([real]) => real === ONLY) : PAIRS
  if (ONLY && !pairs.length) { console.error(`--only ${ONLY} nao bate com nenhum periodo real`); process.exit(1) }

  console.log('\n' + '='.repeat(78))
  console.log(`  VIRADA 2026 (re-analise)  ${DRY ? '*** DRY-RUN (nada sera alterado) ***' : '*** EXECUTE (aplicando) ***'}`)
  console.log(`  periodos: ${pairs.length}${ONLY ? ` (so ${ONLY})` : ''}   journal: ${JOURNAL}`)
  console.log('='.repeat(78))
  if (DRY) console.log('  Este e o PLANO. Rode com --execute para aplicar. O journal so grava em --execute.\n')

  const j = loadJournal()
  const results: Record<string, string> = {}
  for (const [real, shadow] of pairs) {
    console.log(`\n── ${real}  <-  ${shadow} ` + '─'.repeat(40))
    try { results[real] = await switchPeriod(real, shadow, j) }
    catch (e) { results[real] = 'ERRO: ' + (e as Error).message; console.error(`  x ${real}: ${(e as Error).message}`); console.error('  (parando p/ nao deixar estado inconsistente; corrija e re-rode: os periodos OK sao pulados)'); break }
  }

  console.log(`\n${'='.repeat(78)}\n  POS-LOTE`)
  if (!SKIP_EMB && Object.values(results).some(r => r === 'done')) {
    console.log(`\n  6) EMBEDDINGS das trends promovidas (idempotente):`)
    runEmbeddings()
    j.embeddingsGenerated = true; saveJournal(j)
  } else console.log(`\n  6) embeddings: pulado (--skip-embeddings ou nada promovido).`)

  console.log(`\n  7) REVALIDACAO das superficies:`)
  await triggerRevalidate()
  j.revalidated = true; saveJournal(j)

  // ── 8) Relatorio de curadoria orfa ───────────────────────────────────────────
  console.log(`\n  8) CURADORIA ORFA (re-curar no admin apos a virada):`)
  let anyOrphan = false
  for (const [real] of pairs) {
    const a = j.periods[real]?.archived
    if (!a) continue
    if (a.publicIds.length) { anyOrphan = true; console.log(`     ${real}: is_public orfao em report(s) arquivado(s): ${a.publicIds.join(', ')}`) }
    for (const h of a.heroTrends) { anyOrphan = true; console.log(`     ${real}: is_hero orfao -> report #${h.reportNumber} trend#${h.rank} "${h.title ?? ''}" (${h.trendId})`) }
  }
  if (!anyOrphan) console.log(`     nenhum flag de curadoria (is_public/is_hero) nos reports arquivados.`)

  console.log(`\n  RESUMO: ${Object.entries(results).map(([p, r]) => `${p}=${r}`).join('  ')}`)
  console.log(DRY ? '\n  *** DRY-RUN: nada foi alterado. Revise o plano e rode --execute. ***\n' : '\n  *** EXECUTE concluido. ***\n')
}
main().catch(e => { console.error(e); process.exit(1) })
