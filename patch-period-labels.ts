import 'dotenv/config'
import { parsePeriod } from './period-utils'

const SUPABASE_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '')
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY ?? ''

const reports = [
  { id: 'b1b6a01e-70dc-4859-a945-3d0d85df5193', period: '2026-04-01' },
  { id: '2ff28630-18ff-44ff-8fd2-22aa736530cf', period: '2026-01-16' },
  { id: 'a4797b06-f2ad-46f2-8bd6-f5993e8e479e', period: '2026-02-01' },
  { id: 'c3c44d85-5534-47c0-9bb9-28904036b1ae', period: '2026-02-16' },
  { id: '9a4b1333-fae3-492a-9f2f-4fe509b6c321', period: '2026-03-01' },
  { id: 'a2c1488a-16cc-42f3-8e45-cf50ac30e6f5', period: '2026-03-16' },
  { id: '29e85d06-cd58-4bcd-a0eb-01054f9ad0ab', period: '2026-04-16' },
]

async function main() {
  for (const { id, period } of reports) {
    const pi = parsePeriod(period)
    const body = JSON.stringify({ period_label: pi.labelPt, period_type: pi.type })
    const res = await fetch(`${SUPABASE_BASE}/rest/v1/reports?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body,
    })
    if (res.ok) {
      console.log(`✓ ${period} → ${pi.labelPt} (${pi.type})`)
    } else {
      console.error(`✗ ${period}: ${res.status} ${await res.text()}`)
    }
  }
}

main().catch(console.error)
