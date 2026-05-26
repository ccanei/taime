#!/usr/bin/env npx ts-node
/**
 * TAIME — Period Generator
 * Generates the full list of periods between two dates and saves to batch-periods.json.
 *
 * Usage:
 *   npx ts-node generate-periods.ts 2026-01-01 2026-05-31
 *   npx ts-node generate-periods.ts 2022-01-01 2022-12-31
 *
 * Output:
 *   - Prints period list to terminal
 *   - Saves to batch-periods.json in current directory
 */

import * as fs from 'fs';
import { generatePeriods } from './period-utils';

const [,, fromArg, toArg] = process.argv;

if (!fromArg || !toArg) {
  console.error('\nUsage: npx ts-node generate-periods.ts FROM_DATE TO_DATE');
  console.error('Example: npx ts-node generate-periods.ts 2026-01-01 2026-05-31\n');
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromArg) || !/^\d{4}-\d{2}-\d{2}$/.test(toArg)) {
  console.error('\n✗ Datas devem estar no formato YYYY-MM-DD\n');
  process.exit(1);
}

const periods = generatePeriods(fromArg, toArg);

if (periods.length === 0) {
  console.error(`\n✗ Nenhum período encontrado entre ${fromArg} e ${toArg}\n`);
  process.exit(1);
}

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║   TAIME — Period Generator                   ║`);
console.log(`╚══════════════════════════════════════════════╝`);
console.log(`Intervalo: ${fromArg} → ${toArg}`);
console.log(`Total:     ${periods.length} período(s)\n`);

const lines: string[] = [];
const periodKeys: string[] = [];

// Group by type for display
let lastType = '';
for (let i = 0; i < periods.length; i++) {
  const p = periods[i];
  if (p.type !== lastType) {
    console.log(`  [${p.type.toUpperCase()}]`);
    lastType = p.type;
  }
  const idx    = String(i + 1).padStart(3, '0');
  const line   = `  ${idx}. ${p.key}  ${p.labelPt}`;
  const padded = line.padEnd(55);
  const en     = `(${p.labelEn})`;
  console.log(`${padded}${en}`);
  lines.push(`${p.key}: ${p.labelPt} / ${p.labelEn}`);
  periodKeys.push(p.key);
}

const outPath = 'batch-periods.json';
fs.writeFileSync(outPath, JSON.stringify(periodKeys, null, 2), 'utf-8');

console.log(`\n✓ ${periods.length} períodos salvos em ${outPath}`);
console.log('  Próximo: npx ts-node batch-pipeline.ts\n');
