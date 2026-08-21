#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SEGUNDA PASSADA DO JUDGE sobre as 11 sombras (piloto 03-08 + as 10 do batch).
# O judge e nao-deterministico: PASS duplo = criterio de robustez. Fluxo:
#   1) snapshot da 1a passada (congela validation_verdict/flags -> reanalysis-pass1.json);
#   2) re-roda validate em cada sombra que tenha report vivo (2a passada);
#   3) compara 1a vs 2a e reporta divergencias.
# NO_AUTO_PUBLISH=1: continua tudo pending_review. Nao toca periodo real.
# Rodar SO depois do batch terminar. Uso: ./run-second-judge-pass.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
export NO_AUTO_PUBLISH=1
SHADOWS=(2026-01-08 2026-01-23 2026-02-08 2026-02-23 2026-03-08 2026-03-23 2026-04-08 2026-04-23 2026-05-08 2026-05-23 2026-06-08)
LOG="reanalysis-secondpass.log"
: > "$LOG"
log () { echo "$@" | tee -a "$LOG"; }
caffeinate -i -w $$ &

log "=== 2a PASSADA DO JUDGE ($(date -u)) ==="
log "--- snapshot da 1a passada ---"
npx ts-node snapshot-shadow-verdicts.ts >> "$LOG" 2>&1
log "snapshot exit=$?"

for P in "${SHADOWS[@]}"; do
  if ! PERIOD="$P" npx ts-node shadow-report-exists.ts >> "$LOG" 2>&1; then
    log ">>> $P sem report vivo; pulando 2a passada."
    continue
  fi
  ok=0
  for a in 1 2 3; do
    log "--- $P : validate 2a passada (tentativa $a) ---"
    if PERIOD="$P" npx ts-node validate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
    log "validate 2a passada tentativa $a falhou"
  done
  [ "$ok" = 1 ] || log "x validate 2a passada falhou 3x em $P"
done

log "--- comparacao 1a vs 2a passada ---"
npx ts-node compare-shadow-verdicts.ts 2>&1 | tee -a "$LOG"
log "=== 2a PASSADA FIM $(date -u) ==="
