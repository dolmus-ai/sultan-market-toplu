-- Faz 3: Kartla yapılan ödemelerde hangi kartın kullanıldığını kaydetme
-- Kartların adını kullanıcı kendisi verir (örn. "GARANTİ POS", "SODEXO").

create table public.kartlar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  tip text not null check (tip in ('kredi_karti','yemek_karti')),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tip, ad)
);

-- Kart silinse bile geçmiş hareket kaybolmasın: bağ kopar, kayıt durur
alter table public.hareketler
  add column kart_id uuid references public.kartlar(id) on delete set null;

-- Kart yalnızca kartlı ödemelerde işaretlenebilir
alter table public.hareketler add constraint hareketler_kart_yontem_chk
  check (kart_id is null or odeme_yontemi in ('kredi_karti','yemek_karti'));

create index hareketler_kart_idx on public.hareketler (kart_id);

-- Türkçe büyük harf standardı (diğer metin kayıtlarıyla aynı kural)
create or replace function public.kartlar_buyuk_harf()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.ad := public.tr_upper(new.ad);
  return new;
end $$;
create trigger kartlar_buyuk_harf before insert or update on public.kartlar
  for each row execute function public.kartlar_buyuk_harf();

alter table public.kartlar enable row level security;
create policy "kartlar select" on public.kartlar
  for select to authenticated using (true);
create policy "kartlar insert" on public.kartlar
  for insert to authenticated with check (true);
create policy "kartlar update" on public.kartlar
  for update to authenticated using (true) with check (true);
create policy "kartlar delete" on public.kartlar
  for delete to authenticated using (true);

-- Muhasebe kilidi: kartlar da bir muhasebe tablosudur; kurye gibi profili
-- olmayan kullanıcılar erişemesin (diğer muhasebe tablolarıyla aynı kural).
-- Kilit fonksiyonu yoksa (temiz kurulum) bu adım atlanır.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'muhasebeci_mi'
  ) then
    create policy "muhasebe kilidi" on public.kartlar
      as restrictive for all to authenticated
      using (public.muhasebeci_mi()) with check (public.muhasebeci_mi());
  end if;
end $$;

-- Güvenlik: trigger fonksiyonu API üzerinden çağrılamasın
revoke execute on function public.kartlar_buyuk_harf() from public, anon, authenticated;
