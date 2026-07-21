-- Faz 3: Öğrenen marka→cari eşlemesi + büyük harf standardı

-- OCR'da tespit edilen markanın hangi cariye (gruba) yazılacağını öğrenir.
-- Kullanıcı onay ekranında bir markayı bir cariye atayınca kayıt güncellenir;
-- sonraki taramalarda aynı marka otomatik o cariye toplanır.
create table public.marka_esleme (
  id uuid primary key default gen_random_uuid(),
  marka text not null unique,
  cari_id uuid not null references public.cariler(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.marka_esleme enable row level security;
create policy "marka_esleme select" on public.marka_esleme
  for select to authenticated using (true);
create policy "marka_esleme insert" on public.marka_esleme
  for insert to authenticated with check (true);
create policy "marka_esleme update" on public.marka_esleme
  for update to authenticated using (true) with check (true);
create policy "marka_esleme delete" on public.marka_esleme
  for delete to authenticated using (true);

-- Türkçe kurallarına göre büyük harf (i → İ); tüm metin kayıtları büyük tutulur
create or replace function public.tr_upper(s text)
returns text language sql immutable as $$
  select upper(s collate "tr-TR-x-icu")
$$;

create or replace function public.cariler_buyuk_harf()
returns trigger language plpgsql as $$
begin
  new.unvan := public.tr_upper(new.unvan);
  new.adres := public.tr_upper(new.adres);
  return new;
end $$;
create trigger cariler_buyuk_harf before insert or update on public.cariler
  for each row execute function public.cariler_buyuk_harf();

create or replace function public.hareketler_buyuk_harf()
returns trigger language plpgsql as $$
begin
  new.aciklama := public.tr_upper(new.aciklama);
  return new;
end $$;
create trigger hareketler_buyuk_harf before insert or update on public.hareketler
  for each row execute function public.hareketler_buyuk_harf();

create or replace function public.marka_esleme_buyuk_harf()
returns trigger language plpgsql as $$
begin
  new.marka := public.tr_upper(new.marka);
  return new;
end $$;
create trigger marka_esleme_buyuk_harf before insert or update on public.marka_esleme
  for each row execute function public.marka_esleme_buyuk_harf();

-- Mevcut kayıtları da büyük harfe çevir
update public.cariler set unvan = public.tr_upper(unvan), adres = public.tr_upper(adres)
  where unvan is distinct from public.tr_upper(unvan)
     or adres is distinct from public.tr_upper(adres);
update public.hareketler set aciklama = public.tr_upper(aciklama)
  where aciklama is distinct from public.tr_upper(aciklama);

-- Güvenlik: trigger fonksiyonları API üzerinden çağrılamasın
revoke execute on function public.cariler_buyuk_harf() from public, anon, authenticated;
revoke execute on function public.hareketler_buyuk_harf() from public, anon, authenticated;
revoke execute on function public.marka_esleme_buyuk_harf() from public, anon, authenticated;
