#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FASE 1 - RE-ANALISE EM LOTE das 10 quinzenas magras restantes de 2026.
# (2026-03-01 ja foi feita no piloto -> sombra 2026-03-08.)
#
# Para cada periodo REAL: COPIA seus signals para a SOMBRA (origin=reanalysis_batch,
# is_noise reset) SEM recoletar, e roda o pipeline atual sobre a sombra:
#   filter (Haiku) -> analyze (Sonnet, cap atual) -> generate (Opus 4.8) -> validate.
# NO_AUTO_PUBLISH=1 (tudo pending_review). Sequencial, nunca em paralelo.
#
# RETOMADA: um periodo com report vivo na sombra e pulado (shadow-report-exists.ts).
# RESUME EM FALHA: se um periodo falhar, registra e SEGUE para o proximo (nao aborta o lote).
#
# REGRA ABSOLUTA: nenhum UPDATE/DELETE em periodo real. So INSERT na sombra + processa a sombra.
# Uso: ./run-reanalysis-batch.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
export NO_AUTO_PUBLISH=1

# Pares "REAL:SOMBRA". Sombra = dia 08 (quinzena que comeca dia 01) ou 23 (dia 16),
# datas inexistentes no calendario; parsePeriod resolve a janela correta (08->1..15, 23->16..fim).
PAIRS=(
  "2026-01-01:2026-01-08"
  "2026-01-16:2026-01-23"
  "2026-02-01:2026-02-08"
  "2026-02-16:2026-02-23"
  "2026-03-16:2026-03-23"
  "2026-04-01:2026-04-08"
  "2026-04-16:2026-04-23"
  "2026-05-01:2026-05-08"
  "2026-05-16:2026-05-23"
  "2026-06-01:2026-06-08"
)

LOG="reanalysis-batch.log"
: > "$LOG"
log () { echo "$@" | tee -a "$LOG"; }

caffeinate -i -w $$ &
log "caffeinate PID: $!"
log "=== BATCH RE-ANALISE 2026 (${#PAIRS[@]} periodos) inicio $(date -u) ==="

OK=(); FAIL=(); SKIP=()

for pair in "${PAIRS[@]}"; do
  REAL="${pair%%:*}"; SHADOW="${pair##*:}"
  log ""
  log "############################################################"
  log "### PERIODO REAL $REAL -> SOMBRA $SHADOW  $(date -u)"
  log "############################################################"

  # Retomada: pula se ja ha report vivo na sombra.
  if PERIOD="$SHADOW" npx ts-node shadow-report-exists.ts >> "$LOG" 2>&1; then
    log ">>> $SHADOW ja concluido (report vivo). Pulando."
    SKIP+=("$SHADOW"); continue
  fi

  # 1) Copia (idempotente: pula se a sombra ja tem signals).
  log "--- $SHADOW : copy-signals-to-shadow (origin=reanalysis_batch) ---"
  if ! COPY_ORIGIN=reanalysis_batch SKIP_IF_EXISTS=1 SOURCE_PERIOD="$REAL" SHADOW_PERIOD="$SHADOW" \
        npx ts-node copy-signals-to-shadow.ts >> "$LOG" 2>&1; then
    log "x COPY falhou em $SHADOW; registrando e seguindo."
    FAIL+=("$SHADOW(copy)"); continue
  fi

  # 2) Pipeline sobre a sombra (runner testado do piloto: filter->analyze->generate(Opus)->validate).
  log "--- $SHADOW : pipeline (run-reanalysis-pilot.sh) ---"
  if ./run-reanalysis-pilot.sh "$SHADOW" >> "$LOG" 2>&1; then
    log ">>> $SHADOW CONCLUIDO."
    OK+=("$SHADOW")
  else
    log "x PIPELINE falhou em $SHADOW (ver reanalysis-$SHADOW.log); registrando e seguindo."
    FAIL+=("$SHADOW(pipeline)")
  fi
done

log ""
log "=== BATCH RE-ANALISE 2026 FIM $(date -u) ==="
log "OK   (${#OK[@]}): ${OK[*]:-nenhum}"
log "SKIP (${#SKIP[@]}): ${SKIP[*]:-nenhum}"
log "FAIL (${#FAIL[@]}): ${FAIL[*]:-nenhum}"
[ "${#FAIL[@]}" -eq 0 ] || log "NOTA: periodos em FAIL podem ser retomados re-rodando este script (os OK/SKIP sao pulados)."
