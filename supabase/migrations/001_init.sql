-- Sultan Market Bakkal Defteri — temel şema
-- Kullanıcı profilleri (auth.users'a bağlı)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'personel' check (role in ('sahip','personel')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Cariler: alıcı (müşteri) / satıcı (toptancı)
create table public.cariler (
  id uuid primary key default gen_random_uuid(),
  tip text not null check (tip in ('alici','satici')),
  unvan text not null,
  telefon text,
  adres text,
  aktif boolean not null default true,
  acilis_tarihi date not null default current_date,
  created_at timestamptz not null default now()
);

-- Hareketler: fatura/veresiye borçlandırır, ödemeler düşer
create table public.hareketler (
  id uuid primary key default gen_random_uuid(),
  cari_id uuid not null references public.cariler(id) on delete cascade,
  tur text not null check (tur in ('fatura','veresiye','yapilan_odeme','gelen_odeme')),
  tutar numeric(12,2) not null check (tutar > 0),
  odeme_yontemi text check (odeme_yontemi in ('nakit','kredi_karti','yemek_karti')),
  aciklama text,
  tarih date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index hareketler_cari_idx on public.hareketler (cari_id, tarih desc);
create index hareketler_tarih_idx on public.hareketler (tarih desc);

-- Cari özet: Gelen Fatura/Veresiye, Yapılan/Gelen Ödeme, Kalan Bakiye
create view public.cari_ozet with (security_invoker = true) as
select
  c.*,
  coalesce(sum(h.tutar) filter (where h.tur in ('fatura','veresiye')), 0) as toplam_giris,
  coalesce(sum(h.tutar) filter (where h.tur in ('yapilan_odeme','gelen_odeme')), 0) as toplam_odeme,
  coalesce(sum(h.tutar) filter (where h.tur in ('fatura','veresiye')), 0)
    - coalesce(sum(h.tutar) filter (where h.tur in ('yapilan_odeme','gelen_odeme')), 0) as kalan_bakiye
from public.cariler c
left join public.hareketler h on h.cari_id = c.id
group by c.id;

-- RLS: yalnızca giriş yapmış ekip erişir (tek işletme)
alter table public.profiles enable row level security;
create policy "profiles select" on public.profiles
  for select to authenticated using (true);
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

alter table public.cariler enable row level security;
create policy "cariler select" on public.cariler
  for select to authenticated using (true);
create policy "cariler insert" on public.cariler
  for insert to authenticated with check (true);
create policy "cariler update" on public.cariler
  for update to authenticated using (true) with check (true);

alter table public.hareketler enable row level security;
create policy "hareketler select" on public.hareketler
  for select to authenticated using (true);
create policy "hareketler insert" on public.hareketler
  for insert to authenticated with check (created_by = auth.uid());
create policy "hareketler delete" on public.hareketler
  for delete to authenticated using (true);
