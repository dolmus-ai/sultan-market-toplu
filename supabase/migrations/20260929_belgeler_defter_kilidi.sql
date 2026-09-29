-- Fatura/fiş belgeleri yalnızca bakkal defteri ekibine açık.
--
-- Defter ekibi = profiles kaydı olan hesaplar (sahip/personel). Kurye
-- hesaplarının profiles kaydı yok; cariler, hareketler, kartlar ve
-- marka_esleme tabloları "muhasebe kilidi" (muhasebeci_mi) ile zaten
-- kapalıydı, ama "belgeler" deposundaki fatura görselleri her oturuma
-- açıktı. Bu kısıtlayıcı kural aynı kilidi depoya da uygular; diğer
-- depolara (bucket) dokunmaz.

create policy "belgeler defter kilidi" on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'belgeler' or public.muhasebeci_mi())
  with check (bucket_id <> 'belgeler' or public.muhasebeci_mi());
