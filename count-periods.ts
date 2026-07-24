import 'dotenv/config';
const u = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const k = process.env.SUPABASE_SERVICE_KEY ?? '';
async function count(path: string): Promise<number> {
  const r = await fetch(`${u}/rest/v1/${path}`, {
    headers: { apikey: k, Authorization: `Bearer ${k}`, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = r.headers.get('content-range') ?? '';
  const total = cr.split('/')[1];
  return total ? parseInt(total, 10) : 0;
}
async function main() {
  for (const p of ['2023-06-01', '2023-06-08', '2023-06-16', '2023-06-23']) {
    const sig = await count(`signals?period=eq.${p}&select=id`);
    const cl  = await count(`signal_clusters?period=eq.${p}&select=id`);
    const rep = await count(`reports?period=eq.${p}&select=id`);
    console.log(`${p}: signals=${sig} clusters=${cl} reports=${rep}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
