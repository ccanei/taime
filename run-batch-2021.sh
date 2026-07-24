#!/bin/bash
# Runner autonomo do batch 2021 (Opus 4.8, NO_AUTO_PUBLISH=1).
# PASS 1: batch completo (le batch-periods.json = 24 periodos faltantes, dez->jan).
# PASS 2 e 3: --resume automatico para reprocessar falhas transitorias (rede,
# rate limit, parse). A geracao (generate-report) ja retenta 4x internamente em
# 429/5xx. Guarda de idempotencia (clusters existentes) => periodo re-falha e fica
# registrado; nada e apagado. Nao toca nos scripts do pipeline.
set -uo pipefail
cd "$(dirname "$0")"
export NO_AUTO_PUBLISH=1
LOG=batch-2021.log

echo "======== PASS 1 (full) $(date -u) ========" >> "$LOG"
npx ts-node batch-pipeline.ts >> "$LOG" 2>&1

for pass in 2 3; do
  FAILED=$(node -e "try{const p=require('./batch-progress.json');console.log((p.failed||[]).length)}catch(e){console.log(0)}")
  if [ "${FAILED:-0}" -eq 0 ]; then
    echo "======== no failures after pass $((pass-1)), skipping resume $(date -u) ========" >> "$LOG"
    break
  fi
  echo "======== PASS $pass (resume, $FAILED failed) waiting 300s $(date -u) ========" >> "$LOG"
  sleep 300
  npx ts-node batch-pipeline.ts --resume >> "$LOG" 2>&1
done

echo "======== BATCH_2021_DONE $(date -u) ========" >> "$LOG"
