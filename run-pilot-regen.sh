#!/usr/bin/env bash
# Runner do PILOTO DE REGENERACAO para um periodo-sombra (pipeline COMPLETO, full collect).
# Uso: ./run-pilot-regen.sh 2026-02-08 [skip-collect]
#
# Mede o pipeline atual (175 fontes ativas + Leva 1 no TOPIC_BY_CATEGORY + extrator
# readability + prevencao de contaminacao) num periodo HISTORICO, gravando TUDO sob a
# data-sombra (STORE_KEY cru do collect-signals), enquanto a JANELA de coleta e a do
# periodo-alvo real (parsePeriod da sombra 08 resolve a 1a quinzena 01..15). Nada do
# periodo real e tocado: filter/analyze/generate/validate consultam e gravam pelo PERIOD
# cru (a sombra), nunca pela chave normalizada.
#
# Steps: collect(full) -> filter -> analyze -> generate(Opus) -> validate.
# NO_AUTO_PUBLISH=1: mesmo um veredito pass deixa o relatorio em pending_review (nunca
# publica, nunca aparece em superficie publica).
set -u
P="${1:?period required (ex: 2026-02-08)}"
SKIP_COLLECT="${2:-}"
export NO_AUTO_PUBLISH=1
LOG="pilot-${P}.log"
: > "$LOG"
log () { echo "$@" | tee -a "$LOG"; }

# Mantem a maquina acordada durante a coleta longa; morre com o script.
caffeinate -i -w $$ &
log "caffeinate PID: $!"
log "=== PILOTO REGEN periodo-sombra $P (full collect) $(date -u) ==="

if [ "$SKIP_COLLECT" != "skip-collect" ]; then
  log "=== $P : collect (full: site:dominio + TOPIC_BY_CATEGORY, janela do alvo) ==="
  COLLECT_MODE=full PERIOD="$P" npx ts-node collect-signals.ts >> "$LOG" 2>&1
  log "collect exit=$?"
else
  log "=== $P : collect PULADO (ja coletado) ==="
fi

log "=== $P : filter ==="
PERIOD="$P" npx ts-node filter-signals.ts >> "$LOG" 2>&1
log "filter exit=$?"

ok=0
for a in 1 2 3; do
  log "=== $P : analyze (tentativa $a) ==="
  if PERIOD="$P" npx ts-node analyze-signals.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "analyze tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "x analyze falhou 3x em $P; abortando periodo"; exit 1; }

ok=0
for a in 1 2 3; do
  log "=== $P : generate (Opus, tentativa $a) ==="
  if PERIOD="$P" npx ts-node generate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "generate tentativa $a falhou; limpando relatorios parciais (so da sombra)"
  PERIOD="$P" npx ts-node cleanup-period-reports.ts >> "$LOG" 2>&1
done
[ "$ok" = 1 ] || { log "x generate falhou 3x em $P; abortando periodo"; exit 1; }

ok=0
for a in 1 2 3; do
  log "=== $P : validate (tentativa $a) ==="
  if PERIOD="$P" npx ts-node validate-report.ts >> "$LOG" 2>&1; then ok=1; break; fi
  log "validate tentativa $a falhou"
done
[ "$ok" = 1 ] || { log "x validate falhou 3x em $P"; exit 1; }

log "=== PILOTO REGEN $P CONCLUIDO $(date -u) ==="
