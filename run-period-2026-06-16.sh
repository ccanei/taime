#!/bin/bash
# Runner de periodo unico 2026-06-16 (Sonnet, NO_AUTO_PUBLISH=1).
# Retry so nos steps idempotentes e propensos a rede (collect, filter).
# analyze/generate rodam single-shot (guardas de idempotencia tornam retry cego inseguro).
set -euo pipefail
export PERIOD=2026-06-16
export NO_AUTO_PUBLISH=1

run_retry() {
  local script="$1"
  local i
  for i in 1 2 3; do
    if npx ts-node "$script"; then return 0; fi
    echo ">>> RETRY $script (tentativa $i falhou), aguardando 25s..."
    sleep 25
  done
  echo ">>> FATAL: $script falhou apos 3 tentativas"
  return 1
}

echo "STEP collect";           run_retry collect-signals.ts
echo "STEP filter";            run_retry filter-signals.ts
echo "STEP analyze";           npx ts-node analyze-signals.ts
echo "STEP generate+validate"; npx ts-node generate-report.ts
echo "PIPELINE_DONE_2026_06_16"
