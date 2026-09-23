-- Adres bulucuda onaylanıp haritaya eklenen siteler ve apartmanlar.
--
-- Kayıt yalnızca kurye "Onayla" dediğinde düşer: aday OSM derlemesinden,
-- canlı aramadan (Nominatim / Google) ya da haritaya elle konan pinden
-- gelebilir. Konum, kuryenin sürükleyip onayladığı noktadır.

create table public.siteler (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (length(btrim(ad)) between 2 and 120),
  tur text not null default 'site' check (tur in ('site', 'apartman')),
  ilce text,
  mahalle text,
  adres text,
  -- Sakarya il sınırının kapsayan kutusu; il dışına pin düşmesin.
  lat double precision not null check (lat between 40.29 and 41.36),
  lng double precision not null check (lng between 29.96 and 31.02),
  -- [{ "ad": "B Blok", "lat": 40.77, "lng": 30.36 }, …]
  bloklar jsonb not null default '[]'::jsonb check (jsonb_typeof(bloklar) = 'array'),
  kaynak text not null default 'elle'
    check (kaynak in ('osm', 'nominatim', 'google', 'elle')),
  -- OSM için "w123", Google için place_id. Aynı yer iki kez eklenmesin.
  kaynak_id text,
  notlar text,
  ekleyen uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kaynak, kaynak_id)
);

create index siteler_konum on public.siteler (lat, lng);

alter table public.siteler enable row level security;

create policy "personel okur" on public.siteler
  for select to authenticated using (public.personel_mi());

create policy "personel ekler" on public.siteler
  for insert to authenticated with check (public.personel_mi());

create policy "personel gunceller" on public.siteler
  for update to authenticated
  using (public.personel_mi()) with check (public.personel_mi());

-- Kurye yalnızca kendi eklediğini kaldırabilir; gerisi sahipte.
create policy "ekleyen siler" on public.siteler
  for delete to authenticated
  using (public.personel_mi() and ekleyen = auth.uid());

create policy "sahip tam yetki" on public.siteler
  for all to authenticated
  using (public.sahip_mi()) with check (public.sahip_mi());

-- Bir kuryenin eklediği site diğerlerinin haritasına anında düşsün.
alter publication supabase_realtime add table public.siteler;
