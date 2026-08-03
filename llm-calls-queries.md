# llm_calls: consultas prontas

Telemetria de chamadas LLM (tabela `public.llm_calls`, criada por `migration-llm-calls.sql`).
Rode no SQL Editor do Supabase. Ajuste os precos conforme a tabela oficial (abaixo).

## Precos por 1M tokens (ajuste aqui, valores de referencia 2026)

```
-- model                | input $/1M | output $/1M   (cache_read ~= 10% do input; cache_write ~= 125% do input)
-- claude-opus-4-8      |   5.00     |   25.00
-- claude-sonnet-5      |   3.00     |   15.00     (intro 2.00 / 10.00 ate 2026-08-31)
-- claude-sonnet-4-6    |   3.00     |   15.00
-- claude-haiku-4-5     |   1.00     |    5.00
-- (modelos com sufixo de data, ex 'claude-haiku-4-5-20251001', casam pelo prefixo no CASE)
```

O `input_tokens` da Anthropic ja EXCLUI os tokens servidos do cache; por isso o custo
soma: input_tokens (preco cheio) + cache_read (10%) + cache_write (125%) + output.
As 5 queries reusam esta CTE de custo por linha (copie o bloco `with priced as (...)`).

```sql
-- CTE base: custo estimado por linha (edite os precos no CASE).
with priced as (
  select
    *,
    (case
       when model like 'claude-opus-4-8%'   then 5.00
       when model like 'claude-sonnet-5%'    then 3.00
       when model like 'claude-sonnet-4-6%'  then 3.00
       when model like 'claude-haiku-4-5%'   then 1.00
       else 3.00                                  -- default: ajuste p/ modelos novos
     end) as in_price,
    (case
       when model like 'claude-opus-4-8%'   then 25.00
       when model like 'claude-sonnet-5%'    then 15.00
       when model like 'claude-sonnet-4-6%'  then 15.00
       when model like 'claude-haiku-4-5%'   then  5.00
       else 15.00
     end) as out_price
  from public.llm_calls
),
costed as (
  select
    *,
    ( coalesce(input_tokens,0)       / 1e6 * in_price
    + coalesce(cache_read_tokens,0)  / 1e6 * in_price * 0.10
    + coalesce(cache_write_tokens,0) / 1e6 * in_price * 1.25
    + coalesce(output_tokens,0)      / 1e6 * out_price ) as cost_usd
  from priced
)
select 1;  -- placeholder; as queries abaixo usam `costed`
```

## 1. Custo estimado por dia e por caller

```sql
with priced as (
  select *,
    (case when model like 'claude-opus-4-8%' then 5.00 when model like 'claude-sonnet-5%' then 3.00
          when model like 'claude-sonnet-4-6%' then 3.00 when model like 'claude-haiku-4-5%' then 1.00 else 3.00 end) as in_price,
    (case when model like 'claude-opus-4-8%' then 25.00 when model like 'claude-sonnet-5%' then 15.00
          when model like 'claude-sonnet-4-6%' then 15.00 when model like 'claude-haiku-4-5%' then 5.00 else 15.00 end) as out_price
  from public.llm_calls
),
costed as (
  select *,
    ( coalesce(input_tokens,0)/1e6*in_price + coalesce(cache_read_tokens,0)/1e6*in_price*0.10
    + coalesce(cache_write_tokens,0)/1e6*in_price*1.25 + coalesce(output_tokens,0)/1e6*out_price ) as cost_usd
  from priced
)
select
  date_trunc('day', created_at)::date as dia,
  caller,
  count(*)                            as calls,
  sum(coalesce(input_tokens,0))       as input_tokens,
  sum(coalesce(output_tokens,0))      as output_tokens,
  round(sum(cost_usd)::numeric, 4)    as cost_usd
from costed
where created_at >= now() - interval '30 days'
group by 1, 2
order by 1 desc, cost_usd desc;
```

## 2. Custo por user_id no Advisor (unit economics)

```sql
with priced as (
  select *,
    (case when model like 'claude-opus-4-8%' then 5.00 when model like 'claude-sonnet-5%' then 3.00
          when model like 'claude-sonnet-4-6%' then 3.00 when model like 'claude-haiku-4-5%' then 1.00 else 3.00 end) as in_price,
    (case when model like 'claude-opus-4-8%' then 25.00 when model like 'claude-sonnet-5%' then 15.00
          when model like 'claude-sonnet-4-6%' then 15.00 when model like 'claude-haiku-4-5%' then 5.00 else 15.00 end) as out_price
  from public.llm_calls
),
costed as (
  select *,
    ( coalesce(input_tokens,0)/1e6*in_price + coalesce(cache_read_tokens,0)/1e6*in_price*0.10
    + coalesce(cache_write_tokens,0)/1e6*in_price*1.25 + coalesce(output_tokens,0)/1e6*out_price ) as cost_usd
  from priced
)
select
  user_id,
  count(*)                                                as calls,
  count(*) filter (where meta->>'step' = 'main')          as main_calls,
  round(sum(cost_usd)::numeric, 4)                        as cost_usd,
  round(avg(cost_usd)::numeric, 5)                        as avg_cost_per_call
from costed
where caller = 'advisor' and user_id is not null
  and created_at >= now() - interval '30 days'
group by user_id
order by cost_usd desc
limit 50;
```

## 3. Latencia p50 / p95 por caller

```sql
select
  caller,
  count(*)                                                          as calls,
  percentile_cont(0.50) within group (order by latency_ms)::int     as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms)::int     as p95_ms,
  max(latency_ms)                                                    as max_ms
from public.llm_calls
where latency_ms is not null
  and created_at >= now() - interval '7 days'
group by caller
order by p95_ms desc;
```

## 4. Taxa de erro por caller e por dia

```sql
select
  date_trunc('day', created_at)::date          as dia,
  caller,
  count(*)                                      as calls,
  count(*) filter (where not success)           as errors,
  round(100.0 * count(*) filter (where not success) / nullif(count(*),0), 2) as error_pct,
  array_agg(distinct error_code) filter (where error_code is not null)       as error_codes
from public.llm_calls
where created_at >= now() - interval '14 days'
group by 1, 2
order by 1 desc, error_pct desc;
```

## 5. Cache read vs uncached (eficiencia do caching)

```sql
select
  caller,
  model,
  sum(coalesce(input_tokens,0))       as uncached_input,
  sum(coalesce(cache_read_tokens,0))  as cache_read,
  sum(coalesce(cache_write_tokens,0)) as cache_write,
  round(100.0 * sum(coalesce(cache_read_tokens,0))
        / nullif(sum(coalesce(input_tokens,0)) + sum(coalesce(cache_read_tokens,0)), 0), 1) as cache_hit_pct
from public.llm_calls
where created_at >= now() - interval '7 days'
group by caller, model
order by cache_read desc;
```

## Extra: variancia do judge (validate) por periodo

O caller `validate` roda o judge; comparar chamadas/tokens por periodo ajuda a medir
variancia entre execucoes da mesma validacao.

```sql
select period, count(*) as judge_calls,
       sum(coalesce(output_tokens,0)) as output_tokens,
       round(avg(latency_ms)::numeric,0) as avg_latency_ms
from public.llm_calls
where caller = 'validate' and period is not null
group by period
order by period desc
limit 20;
```
