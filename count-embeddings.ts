#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? '';

async function rest(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
  return r.json() as Promise<Array<Record<string, unknown>>>;
}

async function main(): Promise<void> {
  console.log('env SUPABASE_URL:', supabaseUrl ? 'ok' : 'MISSING');
  console.log('env SERVICE_KEY :', supabaseKey ? 'ok' : 'MISSING');
  console.log('env OPENAI_KEY  :', process.env.OPENAI_API_KEY ? 'ok' : 'MISSING');

  const published = await rest(`reports?status=eq.published&select=id`);
  const pending = await rest(`reports?status=eq.published&embedding=is.null&select=id,period,created_at,published_at&order=created_at.asc`);
  const allStatuses = await rest(`reports?select=status`);

  const byStatus: Record<string, number> = {};
  for (const row of allStatuses) {
    const s = String(row.status);
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  console.log('\nreports por status:', JSON.stringify(byStatus));
  console.log('published total   :', published.length);
  console.log('published sem emb :', pending.length);

  console.log('\nPendentes (period / created_at / published_at):');
  for (const p of pending) {
    console.log(`  ${String(p.id).slice(0, 8)}  period=${p.period ?? 'n/a'}  created=${String(p.created_at ?? '').slice(0, 10)}  published=${String(p.published_at ?? '').slice(0, 10)}`);
  }
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
