#!/usr/bin/env bash
# Pipeline do periodo PRESENTE 2026-07-16 (2a quinzena de julho). Sonnet, sem publicar.
set -u
LOG=gen-2026-07-16.log
: > "$LOG"
export PERIOD=2026-07-16
export NO_AUTO_PUBLISH=1

step () {
  local name="$1"; shift
  echo ""                                    >> "$LOG"
  echo "==================== $name ===================="  >> "$LOG"
  echo "[$(date -u +%H:%M:%S)] START $name"   >> "$LOG"
  "$@" >> "$LOG" 2>&1
  local rc=$?
  echo "[$(date -u +%H:%M:%S)] END $name (exit $rc)" >> "$LOG"
  if [ $rc -ne 0 ]; then
    echo "ABORT: $name falhou (exit $rc). Interrompendo o pipeline." >> "$LOG"
    exit $rc
  fi
}

echo "PERIOD=$PERIOD NO_AUTO_PUBLISH=$NO_AUTO_PUBLISH modelo=Sonnet" >> "$LOG"
step "collect"  npx ts-node collect-signals.ts
step "filter"   npx ts-node filter-signals.ts
step "analyze"  npx ts-node analyze-signals.ts
step "generate" npx ts-node generate-report.ts
step "validate" npx ts-node validate-report.ts
echo "" >> "$LOG"
echo "==================== DONE ====================" >> "$LOG"
