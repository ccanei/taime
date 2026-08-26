// Teste real (temporario): faz UMA chamada barata (Haiku, ~poucos tokens),
// captura tokens+latencia, grava via logLlmCall, flush, e confere a linha.
import 'dotenv/config';
import { logLlmCall, usageTokens, flushLlmCalls } from './llm-telemetry';

const KEY = process.env.ANTHROPIC_API_KEY ?? '';
const base = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const sk = process.env.SUPABASE_SERVICE_KEY ?? '';

async function main() {
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
  });
  const data = await res.json() as { usage?: any; content?: any[] };
  const latency = Date.now() - t0;
  const tokens = usageTokens(data.usage);
  console.log('chamada real (Haiku): status', res.status, '| latency', latency, 'ms');
  console.log('  tokens capturados:', JSON.stringify(tokens));

  const record = { caller: 'test', model: 'claude-haiku-4-5-20251001', ...tokens, latency_ms: latency, success: res.ok, meta: { probe: true } };
  console.log('  registro que sera inserido:', JSON.stringify(record));
  logLlmCall(record);
  await flushLlmCalls();

  // Confere a linha na tabela.
  const h = { apikey: sk, Authorization: 'Bearer ' + sk };
  const q = await fetch(base + '/rest/v1/llm_calls?caller=eq.test&order=created_at.desc&limit=1', { headers: h });
  if (q.status !== 200) {
    console.log('\n>>> llm_calls SELECT status', q.status, '- tabela ainda NAO existe? Aplique migration-llm-calls.sql.');
    console.log('   (a instrumentacao disparou o insert corretamente; so falta a tabela.)');
    return;
  }
  const rows = await q.json();
  console.log('\n>>> LINHA NA llm_calls:', JSON.stringify(rows[0] ?? null, null, 2));
}
main().catch(e => { console.error('erro:', e); process.exit(1); });
