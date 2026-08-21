#!/usr/bin/env bash
# Runner do PILOTO DE RE-ANALISE (sem recoleta) sobre um periodo-sombra ja povoado
# pelas copias (copy-signals-to-shadow.ts). Mede o que o pipeline ATUAL extrai da mina
# de sinais existente: filter (Haiku marca is_noise nas COPIAS) -> analyze (Sonnet, cap
# atual 18, sem o cap antigo de 8) -> generate (Opus 4.8) -> validate.
# NO_AUTO_PUBLISH=1: relatorio fica pending_review (nunca publica). Nao roda collect.
# Uso: ./run-reanalysis-pilot.sh 2026-03-08
set -u
P="${1:?period sombra required (ex: 2026-03-08)}"
export NO_AUTO_PUBLISH=1
LOG="reanalysis-${P}.log"
: > "$LOG"
log () { echo "$@" | tee -a "$LOG"; }
caffeinate -i -w $$ &
log "caffeinate PID: $!"
log "=== PILOTO RE-ANALISE periodo-sombra $P (sem collect) $(date -u) ==="

log "=== $P : filter (Haiku, marca is_noise nas copias) ==="
PERIOD="$P" npx ts-node filter-signals.ts >> "$LOG" 2>&1
log "filter exit=$?"

ok=0
for a in 1 2 3; do
  log "=== $P : analyze (tentativa $a) ==="
  if PERIOD="$P" npx ts-node analyze-signals.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "analyze tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "x analyze falhou 3x em $P; abortando"; exit 1; }

ok=0
for a in 1 2 3; do
  log "=== $P : generate (Opus 4.8, tentativa $a) ==="
  if PERIOD="$P" npx ts-node generate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "generate tentativa $a falhou; limpando relatorios parciais (so da sombra)"
  PERIOD="$P" npx ts-node cleanup-period-reports.ts >> "$LOG" 2>&1
done
[ "$ok" = 1 ] || { log "x generate falhou 3x em $P; abortando"; exit 1; }

ok=0
for a in 1 2 3; do
  log "=== $P : validate (tentativa $a) ==="
  if PERIOD="$P" npx ts-node validate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "validate tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "x validate falhou 3x em $P"; exit 1; }

log "=== PILOTO RE-ANALISE $P CONCLUIDO $(date -u) ==="
