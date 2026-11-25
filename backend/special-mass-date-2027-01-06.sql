alter table public.cancionero_masses
  drop constraint cancionero_masses_date_check,
  add constraint cancionero_masses_date_check check (
    date between date '2020-01-01' and date '2100-12-31'
    and (
      extract(dow from date) = 0
      or date in (date '2026-11-26', date '2026-12-25', date '2027-01-01', date '2027-01-06')
    )
  );
