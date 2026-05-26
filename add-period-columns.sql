-- TAIME — Add period columns to reports table
-- Run this in the Supabase SQL Editor

alter table reports
  add column if not exists period_label text,
  add column if not exists period_type  text check (period_type in ('weekly', 'biweekly', 'monthly')),
  add column if not exists period_start date,
  add column if not exists period_end   date;

-- Back-fill period_label and period_type for existing rows based on period date
-- Monthly (2000–2014): period day is always 01, covers full month
update reports
set
  period_type  = 'monthly',
  period_start = period::date,
  period_end   = (date_trunc('month', period::date) + interval '1 month - 1 day')::date
where
  extract(year from period::date) between 2000 and 2014
  and period_type is null;

-- Biweekly (2015–2021)
update reports
set
  period_type  = 'biweekly',
  period_start = period::date,
  period_end   = case
    when extract(day from period::date) <= 15
    then date_trunc('month', period::date)::date + 14
    else (date_trunc('month', period::date) + interval '1 month - 1 day')::date
  end
where
  extract(year from period::date) between 2015 and 2021
  and period_type is null;

-- Weekly (2022+)
update reports
set
  period_type  = 'weekly',
  period_start = period::date,
  period_end   = case
    when extract(day from period::date) <= 7   then period::date + 6
    when extract(day from period::date) <= 15  then period::date + 7
    when extract(day from period::date) <= 23  then period::date + 7
    else (date_trunc('month', period::date) + interval '1 month - 1 day')::date
  end
where
  extract(year from period::date) >= 2022
  and period_type is null;

-- Add index for date-range queries
create index if not exists reports_period_start_idx on reports (period_start);
create index if not exists reports_period_type_idx  on reports (period_type);
