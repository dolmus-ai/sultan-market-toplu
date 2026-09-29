-- Cari silme (tüm hareketleri cascade ile birlikte gider; UI güçlü onay sorar)
create policy "cariler delete" on public.cariler
  for delete to authenticated using (true);
