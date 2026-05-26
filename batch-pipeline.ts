#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — Batch Pipeline
 * Processa múltiplos períodos sequencialmente: collect → analyze → generate.
 *
 * Usage:
 *   npx ts-node batch-pipeline.ts                     # lê batch-periods.json
 *   npx ts-node batch-pipeline.ts 2026-01-01 2026-05-31  # gera e processa o intervalo
 *   npx ts-node batch-pipeline.ts --resume             # retoma de onde parou
 *
 * Progresso salvo em: batch-progress.json
 */

import * as fs   from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { generatePeriods, parsePeriod } from './period-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Progress {
  completed: string[];
  failed:    string[];
  pending:   string[];
}

interface ReportRow { id: string }

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  delayMs:     15_000, // 15s entre períodos
  progressFile: path.resolve('batch-progress.json'),
  periodsFile:  path.resolve('batch-periods.json'),
};

// ─── Supabase REST ────────────────────────────────────────────────────────────

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey:         cfg.supabaseKey,
      Authorization:  `Bearer ${cfg.supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`DB GET: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

// ─── Idempotency check ────────────────────────────────────────────────────────

async function reportExists(periodKey: string): Promise<boolean> {
  const rows = await dbGet<ReportRow>(
    `reports?period=eq.${periodKey}&status=eq.published&select=id&limit=1`,
  );
  return rows.length > 0;
}

// ─── Progress file ────────────────────────────────────────────────────────────

function loadProgress(): Progress | null {
  if (!fs.existsSync(cfg.progressFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfg.progressFile, 'utf-8')) as Progress;
  } catch {
    return null;
  }
}

function saveProgress(progress: Progress): void {
  fs.writeFileSync(cfg.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
}

// ─── Run a pipeline step ──────────────────────────────────────────────────────

function runStep(script: string, periodKey: string, label: string): boolean {
  try {
    execSync(`npx ts-node ${script}`, {
      env:    { ...process.env, PERIOD: periodKey },
      stdio:  'inherit',
      cwd:    path.dirname(path.resolve(script)),
    });
    return true;
  } catch (err) {
    console.error(`\n  ✗ ${script} falhou para ${label}: ${err}`);
    return false;
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  const args    = process.argv.slice(2);
  const isResume = args.includes('--resume');

  // ── Determine period list ─────────────────────────────────────────────────

  let periodKeys: string[];

  if (!isResume && args.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    // Date range passed as arguments
    const [fromArg, toArg] = args;
    const periods = generatePeriods(fromArg, toArg);
    if (periods.length === 0) {
      console.error(`\n✗ Nenhum período entre ${fromArg} e ${toArg}\n`);
      process.exit(1);
    }
    periodKeys = periods.map(p => p.key);
  } else if (isResume) {
    const progress = loadProgress();
    if (!progress) {
      console.error('\n✗ Nenhum batch-progress.json encontrado para retomar.\n');
      process.exit(1);
    }
    periodKeys = [...progress.pending, ...progress.failed];
    console.log(`Retomando: ${periodKeys.length} período(s) pendente(s) ou com falha.`);
  } else {
    // Read from batch-periods.json
    if (!fs.existsSync(cfg.periodsFile)) {
      console.error(`\n✗ ${cfg.periodsFile} não encontrado.`);
      console.error('  Execute: npx ts-node generate-periods.ts FROM TO\n');
      process.exit(1);
    }
    periodKeys = JSON.parse(fs.readFileSync(cfg.periodsFile, 'utf-8')) as string[];
  }

  // ── Load or initialize progress ───────────────────────────────────────────

  let progress: Progress;
  if (isResume && loadProgress()) {
    const saved = loadProgress()!;
    progress = {
      completed: saved.completed,
      failed:    [],
      pending:   periodKeys,
    };
  } else {
    progress = { completed: [], failed: [], pending: [...periodKeys] };
    saveProgress(progress);
  }

  const total = periodKeys.length;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   TAIME — Batch Pipeline                     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`Total de períodos: ${total}`);
  console.log(`Progresso em:      ${cfg.progressFile}\n`);

  // ── Process each period ───────────────────────────────────────────────────

  const scriptBase = path.dirname(path.resolve('batch-pipeline.ts'));

  for (let i = 0; i < periodKeys.length; i++) {
    const key  = periodKeys[i];
    const info = parsePeriod(key);
    const idx  = `[${String(i + 1).padStart(2)}/${total}]`;

    // Skip already completed
    if (progress.completed.includes(key)) {
      console.log(`${idx} ⏭  ${info.labelPt} — já concluído`);
      continue;
    }

    // Check idempotency: skip if report already published
    try {
      const exists = await reportExists(key);
      if (exists) {
        console.log(`${idx} ⏭  ${info.labelPt} — relatório já publicado no banco`);
        if (!progress.completed.includes(key)) progress.completed.push(key);
        progress.pending = progress.pending.filter(k => k !== key);
        saveProgress(progress);
        continue;
      }
    } catch (err) {
      console.warn(`  ⚠ Falha ao verificar idempotência: ${err} — continuando mesmo assim`);
    }

    console.log(`\n${idx} Processando: ${info.labelPt} (${key})`);
    console.log('─'.repeat(60));

    let ok = true;

    // Step 1: collect
    console.log(`  → collect-signals.ts`);
    if (!runStep(path.join(scriptBase, 'collect-signals.ts'), key, info.labelPt)) {
      ok = false;
    }

    // Step 2: analyze (only if collect succeeded)
    if (ok) {
      console.log(`  → analyze-signals.ts`);
      if (!runStep(path.join(scriptBase, 'analyze-signals.ts'), key, info.labelPt)) {
        ok = false;
      }
    }

    // Step 3: generate (only if both previous steps succeeded)
    if (ok) {
      console.log(`  → generate-report.ts`);
      if (!runStep(path.join(scriptBase, 'generate-report.ts'), key, info.labelPt)) {
        ok = false;
      }
    }

    // Update progress
    progress.pending = progress.pending.filter(k => k !== key);
    if (ok) {
      progress.completed.push(key);
      console.log(`  ✓ ${info.labelPt} concluído`);
    } else {
      progress.failed.push(key);
      console.log(`  ✗ ${info.labelPt} falhou — salvo em progress.failed`);
    }
    saveProgress(progress);

    // Delay between periods (skip after last)
    if (i < periodKeys.length - 1) {
      console.log(`  ⏱ Aguardando ${cfg.delayMs / 1000}s...\n`);
      await sleep(cfg.delayMs);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log(`✓ Concluídos: ${progress.completed.length}`);
  if (progress.failed.length > 0) {
    console.log(`✗ Falhas:     ${progress.failed.length}`);
    console.log(`  ${progress.failed.join(', ')}`);
    console.log('\n  Para retomar os falhos: npx ts-node batch-pipeline.ts --resume');
  }
  console.log('═'.repeat(60) + '\n');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
