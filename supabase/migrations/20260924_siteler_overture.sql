-- Hazır listeye Overture Maps mekânları eklendi; onaylanan site bu kaynağı
-- ve Overture kimliğini taşıyabilsin.
alter table public.siteler drop constraint siteler_kaynak_check;
alter table public.siteler add constraint siteler_kaynak_check
  check (kaynak in ('osm', 'overture', 'nominatim', 'google', 'elle'));
