import 'dotenv/config';

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
};

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

interface S { id: string; tier: number; category: string; name: string; active: boolean }

async function main() {
  const all = await dbGet<S>('sources?select=id,tier,category,name,active');
  const active = all.filter(s => s.active);
  const byTier: Record<number, number> = {};
  const byCat:  Record<string, number> = {};
  for (const s of active) {
    byTier[s.tier] = (byTier[s.tier] ?? 0) + 1;
    byCat[s.category] = (byCat[s.category] ?? 0) + 1;
  }
  console.log(`Total fontes: ${all.length}`);
  console.log(`Ativas:       ${active.length}`);
  console.log(`Por tier:     ${JSON.stringify(byTier)}`);
  console.log(`Por categoria (ativas):`);
  for (const k of Object.keys(byCat).sort()) {
    console.log(`  ${k.padEnd(14)} ${byCat[k]}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
