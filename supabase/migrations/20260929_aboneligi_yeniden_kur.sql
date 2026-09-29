-- Toplu konum düzeltme: defterden gelen konumsuz aboneliği, sahibinin elle
-- yaptığı gibi yeniden kurar — yeni adres (konumlu, doğrulanmış) + yeni
-- abonelik (Pzt–Cum 09:00, bugünden başlar) açılır, eski abonelik silinir.
--
-- Tek işlemde: yarıda kalırsa ne yeni kayıt kalır ne eski silinir.
-- SECURITY INVOKER: çağıranın RLS yetkileriyle çalışır; kurye ekranda
-- yapabildiğinden fazlasını yapamaz.

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
    (musteri_id, adres_id, baslik, siklik, gunler, teslim_saati, baslangic, durum, tutar, notlar)
  values
    (eski.musteri_id, yeni_adres, coalesce(nullif(btrim(eski.baslik), ''), 'Abonelik'),
     'haftalik', '{1,2,3,4,5}', '09:00',
     (now() at time zone 'Europe/Istanbul')::date, 'aktif', eski.tutar, eski.notlar)
  returning id into yeni_abonelik;

  -- Kalemler (varsa) yeni aboneliğe taşınır; sonra eskisi silinir.
  update public.abonelik_kalemleri set abonelik_id = yeni_abonelik where abonelik_id = eski_id;
  delete from public.abonelikler where id = eski_id;
  if not found then
    raise exception 'eski abonelik silinemedi (yetki)' using errcode = '42501';
  end if;

  return yeni_abonelik;
end;
$$;

grant execute on function public.aboneligi_yeniden_kur(uuid, text, double precision, double precision, text, text, text, text) to authenticated;
