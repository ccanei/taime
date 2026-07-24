#!/usr/bin/env bash
# Runner do experimento B (coleta minimal) para um periodo-sombra.
# Uso: ./run-shadow-pipeline.sh 2023-06-08 [skip-collect]
# Steps: collect(minimal) -> filter -> analyze -> generate -> validate
# NO_AUTO_PUBLISH=1 em todos: relatorios ficam em pending_review, published_at=null.
set -u
P="${1:?period required}"
SKIP_COLLECT="${2:-}"
export NO_AUTO_PUBLISH=1
LOG="experiment-${P}.log"
: > "$LOG"

log () { echo "$@" | tee -a "$LOG"; }

# caffeinate atrelado a este script
caffeinate -i -w $$ &
log "caffeinate PID: $!"
log "=== EXPERIMENTO B (minimal) periodo-sombra $P  $(date) ==="

# ── collect (minimal) — idempotente via dedup de URL no periodo ──────────────
if [ "$SKIP_COLLECT" != "skip-collect" ]; then
  log "=== $P : collect (minimal) ==="
  COLLECT_MODE=minimal PERIOD="$P" npx ts-node collect-signals.ts >> "$LOG" 2>&1
  log "collect exit=$?"
else
  log "=== $P : collect PULADO (ja coletado) ==="
fi

# ── filter — idempotente (regrava is_noise) ──────────────────────────────────
log "=== $P : filter ==="
PERIOD="$P" npx ts-node filter-signals.ts >> "$LOG" 2>&1
log "filter exit=$?"

# ── analyze — retry 3x (seguro: grava clusters so no sucesso; exit 0 se ja existem) ──
ok=0
for a in 1 2 3; do
  log "=== $P : analyze (tentativa $a) ==="
  if PERIOD="$P" npx ts-node analyze-signals.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "analyze tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "✗ analyze falhou 3x em $P; abortando periodo"; exit 1; }

# ── generate — retry 3x com limpeza de relatorios parciais entre tentativas ──
ok=0
for a in 1 2 3; do
  log "=== $P : generate (tentativa $a) ==="
  if PERIOD="$P" npx ts-node generate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "generate tentativa $a falhou; limpando relatorios parciais"
  PERIOD="$P" npx ts-node cleanup-period-reports.ts >> "$LOG" 2>&1
done
[ "$ok" = 1 ] || { log "✗ generate falhou 3x em $P; abortando periodo"; exit 1; }

# ── validate — retry 3x (idempotente; NO_AUTO_PUBLISH mantem pending_review) ──
ok=0
for a in 1 2 3; do
  log "=== $P : validate (tentativa $a) ==="
  if PERIOD="$P" npx ts-node validate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "validate tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "✗ validate falhou 3x em $P"; exit 1; }

log "=== $P CONCLUIDO  $(date) ==="
