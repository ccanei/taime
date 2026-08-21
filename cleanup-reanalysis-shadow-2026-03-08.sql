-- ─────────────────────────────────────────────────────────────────────────────
-- Limpeza da SOMBRA do piloto de re-analise (period 2026-03-08)
--
-- Remove SO as linhas do periodo-sombra 2026-03-08 (signals copiados com
-- metadata.origin='reanalysis_pilot', mais os clusters/reports/trends que o piloto
-- gerou sobre elas). NADA do periodo REAL 2026-03-01 e tocado: todos os filtros sao
-- period = '2026-03-08'.
--
-- Rodar manualmente no Supabase SQL Editor QUANDO voce decidir. NAO executado por mim.
-- Confira antes com: select count(*) from signals where period='2026-03-08';
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1) trends dos reports da sombra (FK report_id -> reports)
delete from report_trends
 where report_id in (select id from reports where period = '2026-03-08');

-- 2) reports da sombra
delete from reports where period = '2026-03-08';

-- 3) clusters da sombra
delete from signal_clusters where period = '2026-03-08';

-- 4) signals copiados (todos com origin='reanalysis_pilot')
delete from signals where period = '2026-03-08';

commit;

-- Conferencia pos-limpeza (deve dar 0 em todas):
--   select count(*) from signals        where period='2026-03-08';
--   select count(*) from signal_clusters where period='2026-03-08';
--   select count(*) from reports         where period='2026-03-08';
-- E o real deve seguir intacto:
--   select count(*) from signals where period='2026-03-01';   -- 427
