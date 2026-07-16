-- Faz 2: Fatura/Fiş OCR — belge arşivi ve sunucu tarafı sır erişimi
alter table public.hareketler add column belge_yolu text;

-- Taranan fiş/fatura görselleri (özel bucket, sadece giriş yapmış ekip)
insert into storage.buckets (id, name, public)
values ('belgeler', 'belgeler', false)
on conflict (id) do nothing;

create policy "belgeler upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'belgeler');
create policy "belgeler read" on storage.objects
  for select to authenticated using (bucket_id = 'belgeler');

-- Vault'taki sırları yalnızca service_role okuyabilir (Edge Function için)
-- Sırrın kendisi migration'da DEĞİLDİR; vault.create_secret ile elle eklenir.
create or replace function public.get_secret(secret_name text)
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$$;
revoke all on function public.get_secret(text) from public;
revoke all on function public.get_secret(text) from anon;
revoke all on function public.get_secret(text) from authenticated;
grant execute on function public.get_secret(text) to service_role;
