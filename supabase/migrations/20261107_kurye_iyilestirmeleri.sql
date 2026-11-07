-- Kurye iyileştirmeleri (2026-11-07)
--
-- 1) "Toplu düzelt" artık aboneliğin takvimini korur. Eskiden her abonelik
--    Pzt–Cum 09:00 olarak, bugünden başlayarak yeniden kuruluyordu; kurye
--    bunu fark etmeden binlerce aboneliğin günü/saati değişiyordu. Şimdi
--    sıklık, günler, saat ve başlangıç eski abonelikten taşınır. Eski kayıtta
--    gün ya da saat boşsa önceki varsayılan (Pzt–Cum 09:00) kullanılır.
--
-- 2) Teslim fotoğrafları için özel depo: `teslim-fotolari`. Yol
--    `<sipariş kimliği>/<zaman>.jpg`; siparişler tablosuna sütun eklenmedi.
--    Giriş yapmış kullanıcılar (kurye ve yönetici) yükleyip okuyabilir;
--    silme ve üzerine yazma yok — kanıt değişmesin.

create or replace function public.aboneligi_yeniden_kur(
  eski_id uuid,
  adres_metni text,
  lat double precision,
  lng double precision,
  bina text default null,
  kat text default null,
  daire text default null,
  tarif text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  eski public.abonelikler%rowtype;
  yeni_adres uuid;
  yeni_abonelik uuid;
begin
  select * into eski from public.abonelikler where id = eski_id for update;
  if not found then
    raise exception 'abonelik bulunamadı: %', eski_id using errcode = 'P0002';
  end if;
  if coalesce(btrim(adres_metni), '') = '' or lat is null or lng is null then
    raise exception 'adres ve konum gerekli' using errcode = '22023';
  end if;

  insert into public.adresler
    (musteri_id, baslik, adres_metni, bina, kat, daire, tarif, lat, lng, konum_dogrulandi)
  values
    (eski.musteri_id, 'Ev', btrim(adres_metni), nullif(btrim(bina), ''),
     nullif(btrim(kat), ''), nullif(btrim(daire), ''), nullif(btrim(tarif), ''),
     lat, lng, true)
  returning id into yeni_adres;

  insert into public.abonelikler
    (musteri_id, adres_id, baslik, siklik, gunler, teslim_saati, baslangic, bitis, durum, tutar, notlar)
  values
    (eski.musteri_id, yeni_adres, coalesce(nullif(btrim(eski.baslik), ''), 'Abonelik'),
     coalesce(eski.siklik, 'haftalik'),
     case when coalesce(array_length(eski.gunler, 1), 0) = 0
          then '{1,2,3,4,5}'::smallint[] else eski.gunler end,
     coalesce(eski.teslim_saati, '09:00'),
     coalesce(eski.baslangic, (now() at time zone 'Europe/Istanbul')::date),
     eski.bitis,
     'aktif', eski.tutar, eski.notlar)
  returning id into yeni_abonelik;

  update public.abonelik_kalemleri set abonelik_id = yeni_abonelik where abonelik_id = eski_id;
  delete from public.abonelikler where id = eski_id;
  if not found then
    raise exception 'eski abonelik silinemedi (yetki)' using errcode = '42501';
  end if;

  return yeni_abonelik;
end;
$$;

grant execute on function public.aboneligi_yeniden_kur(uuid, text, double precision, double precision, text, text, text, text) to authenticated;

-- Teslim fotoğrafları deposu
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teslim-fotolari', 'teslim-fotolari', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "teslim fotografi yukle" on storage.objects;
create policy "teslim fotografi yukle"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'teslim-fotolari');

drop policy if exists "teslim fotografi oku" on storage.objects;
create policy "teslim fotografi oku"
  on storage.objects for select to authenticated
  using (bucket_id = 'teslim-fotolari');
