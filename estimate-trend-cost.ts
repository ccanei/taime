#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { makeRest } from './embeddings-shared';

const rest = makeRest(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_KEY ?? '');

async function main(): Promise<void> {
  let offset = 0;
  const page = 1000;
  let totalChars = 0;
  let n = 0;
  for (;;) {
    const rows = await rest<Array<{ content: string }>>(
      `report_trend_embeddings?select=content&limit=${page}&offset=${offset}`,
    );
    for (const r of rows) totalChars += (r.content ?? '').length;
    n += rows.length;
    if (rows.length < page) break;
    offset += page;
  }
  // text-embedding-3-small ~ cl100k: ~4 chars/token (estimativa).
  const estTokens = Math.round(totalChars / 4);
  const usdSingle = (estTokens / 1_000_000) * 0.02;
  console.log('Chunks somados      :', n);
  console.log('Total de caracteres :', totalChars);
  console.log('Tokens estimados    :', estTokens, '(chars/4)');
  console.log('Custo 1 passada     : US$', usdSingle.toFixed(5), `(${(usdSingle * 100).toFixed(3)} cents)`);
  console.log('Custo ~3x (retries) : US$', (usdSingle * 3).toFixed(5), `(${(usdSingle * 3 * 100).toFixed(3)} cents)`);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
