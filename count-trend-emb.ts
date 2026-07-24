#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { makeRest } from './embeddings-shared';

const rest = makeRest(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_KEY ?? '');

async function countHeader(path: string): Promise<number> {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const r = await fetch(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY ?? '',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY ?? ''}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const cr = r.headers.get('content-range') ?? '';
  const total = cr.split('/')[1];
  return Number(total ?? 0);
}

async function main(): Promise<void> {
  const totalChunks = await countHeader('report_trend_embeddings?select=id');
  const ptChunks = await countHeader('report_trend_embeddings?select=id&lang=eq.pt');
  const enChunks = await countHeader('report_trend_embeddings?select=id&lang=eq.en');
  const nullEmb = await countHeader('report_trend_embeddings?select=id&embedding=is.null');
  const publishedTrends = await countHeader('report_trends?select=id&reports.status=eq.published&reports!inner(status)');

  console.log('Trends publicadas        :', publishedTrends);
  console.log('Chunks (total)           :', totalChunks);
  console.log('  lang=pt                :', ptChunks);
  console.log('  lang=en                :', enChunks);
  console.log('  embedding IS NULL      :', nullEmb);
  console.log('Esperado (publicadas x2) :', publishedTrends * 2);
  void rest;
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
