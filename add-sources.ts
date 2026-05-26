#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — add-sources.ts
 * Insere novas fontes na tabela sources do Supabase.
 * Verifica quais URLs já existem e insere apenas as novas.
 *
 * Usage: npx ts-node add-sources.ts
 * Env:   SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const supabaseUrl = (process.env.SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? '';

function headers() {
  return {
    apikey:          supabaseKey,
    Authorization:   `Bearer ${supabaseKey}`,
    'Content-Type':  'application/json',
    Prefer:          'return=representation',
  };
}

// ─── Novas fontes a adicionar ─────────────────────────────────────────────────

interface SourceInput {
  name:     string;
  url:      string;
  tier:     number;
  category: string;
}

const NEW_SOURCES: SourceInput[] = [
  // Research & Advisory
  { name: 'ISG',                           url: 'https://isg-one.com',                                  tier: 1, category: 'research'   },
  { name: 'Everest Group',                 url: 'https://www.everestgrp.com',                           tier: 1, category: 'research'   },
  { name: '451 Research (S&P Global)',     url: 'https://451research.com',                              tier: 1, category: 'research'   },
  { name: 'Accenture Technology Vision',   url: 'https://www.accenture.com/us-en/insights/technology',  tier: 1, category: 'consulting' },

  // Big Tech & Vendor Signals
  { name: 'Microsoft Azure Blog',          url: 'https://azure.microsoft.com/en-us/blog',               tier: 1, category: 'vendor'     },
  { name: 'AWS News Blog',                 url: 'https://aws.amazon.com/blogs/aws',                     tier: 1, category: 'vendor'     },
  { name: 'Google Cloud Blog',             url: 'https://cloud.google.com/blog',                        tier: 1, category: 'vendor'     },
  { name: 'OpenAI News',                   url: 'https://openai.com/news',                              tier: 1, category: 'vendor'     },
  { name: 'Anthropic News',               url: 'https://www.anthropic.com/news',                       tier: 1, category: 'vendor'     },
  { name: 'NVIDIA Blog',                   url: 'https://blogs.nvidia.com',                             tier: 1, category: 'vendor'     },
  { name: 'IBM Research',                  url: 'https://research.ibm.com',                             tier: 1, category: 'research'   },
  { name: 'Oracle News',                   url: 'https://www.oracle.com/news',                          tier: 2, category: 'vendor'     },
  { name: 'SAP News Center',               url: 'https://news.sap.com',                                 tier: 2, category: 'vendor'     },

  // Financial & Market Media
  { name: 'Reuters Technology',            url: 'https://www.reuters.com/technology',                   tier: 1, category: 'media'      },
  { name: 'CNBC Technology',               url: 'https://www.cnbc.com/technology',                      tier: 2, category: 'media'      },

  // Engineering & Technical
  { name: 'Thoughtworks Technology Radar', url: 'https://www.thoughtworks.com/radar',                   tier: 1, category: 'research'   },
  { name: 'InfoQ',                         url: 'https://www.infoq.com',                                tier: 2, category: 'media'      },
  { name: 'CNCF Blog',                     url: 'https://www.cncf.io/blog',                             tier: 2, category: 'research'   },
  { name: 'Linux Foundation',              url: 'https://www.linuxfoundation.org/blog',                 tier: 2, category: 'research'   },

  // Cybersecurity
  { name: 'CrowdStrike Blog',              url: 'https://www.crowdstrike.com/blog',                     tier: 1, category: 'security'   },
  { name: 'Palo Alto Unit 42',             url: 'https://unit42.paloaltonetworks.com',                  tier: 1, category: 'security'   },
  { name: 'Cisco Talos',                   url: 'https://blog.talosintelligence.com',                   tier: 1, category: 'security'   },
  { name: 'Mandiant Blog',                 url: 'https://www.mandiant.com/resources/blog',               tier: 1, category: 'security'   },

  // Academic
  { name: 'arXiv CS & AI',                url: 'https://arxiv.org/list/cs.AI/recent',                  tier: 2, category: 'academic'   },
  { name: 'Nature Technology',             url: 'https://www.nature.com/subjects/technology',           tier: 1, category: 'academic'   },
];

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function getExistingUrls(): Promise<Set<string>> {
  const res = await fetch(`${supabaseUrl}/rest/v1/sources?select=url&limit=1000`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Falha ao buscar fontes: ${await res.text()}`);
  const rows = await res.json() as { url: string }[];
  return new Set(rows.map(r => r.url));
}

async function insertSource(source: SourceInput): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/sources`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ ...source, active: true }),
  });
  if (!res.ok) throw new Error(`Insert falhou para ${source.url}: ${await res.text()}`);
}

async function countSources(): Promise<number> {
  const res = await fetch(`${supabaseUrl}/rest/v1/sources?select=id`, {
    headers: { ...headers(), Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`Count falhou: ${await res.text()}`);
  const range = res.headers.get('content-range') ?? '';
  const match = range.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : -1;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = (['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis de ambiente faltando: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   TAIME — Sources Migration          ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log(`Fontes no script: ${NEW_SOURCES.length}`);

  // Carregar URLs existentes
  console.log('Verificando fontes existentes no banco...');
  let existingUrls: Set<string>;
  try {
    existingUrls = await getExistingUrls();
  } catch (err) {
    console.error(`✗ ${err}`);
    process.exit(1);
  }
  console.log(`Fontes no banco antes: ${existingUrls.size}\n`);
  console.log('─'.repeat(56));

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const source of NEW_SOURCES) {
    const label = source.name.padEnd(36, '.');

    if (existingUrls.has(source.url)) {
      console.log(`  ~ ${label} já existe`);
      skipped++;
      continue;
    }

    try {
      await insertSource(source);
      console.log(`  ✓ ${label} inserida (${source.category}, tier ${source.tier})`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${label} ERRO: ${err}`);
      errors++;
    }
  }

  console.log('─'.repeat(56));
  console.log(`\n  Inseridas: ${inserted}`);
  console.log(`  Já existiam: ${skipped}`);
  if (errors > 0) console.log(`  Erros: ${errors}`);

  // Total final no banco
  try {
    const total = await countSources();
    console.log(`\nTotal de fontes no banco agora: ${total}`);
  } catch {
    // não crítico
  }

  console.log('\nPróximo passo: npx ts-node collect-signals.ts\n');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
