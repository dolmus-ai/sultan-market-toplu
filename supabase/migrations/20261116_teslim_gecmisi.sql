-- Teslim geçmişi: teslim edilen her siparişin kalıcı, silinmez kaydı.
--
-- Neden: teslimat listesinden bir sipariş silinse bile (mağaza sahibi
-- teslim edilmiş siparişi de silebiliyor; silince tahsilat kaydı da
-- zincirleme gidiyor) uygulama o müşteriye teslimat yapıldığını bilmeli.
-- Kayıt teslim anındaki müşteri ve adres bilgisinin kopyasını tutuyor;
-- sipariş, müşteri ya da adres sonradan silinse de geçmiş kalıyor.
--
-- Yalnızca tetikleyici yazıyor; kimse elle ekleyemiyor, değiştiremiyor,
-- silemiyor (sahip de). Teslim geri alınırsa (hızlı listede 6 sn içinde
-- "Geri al") o teslimin kaydı tetikleyici tarafından kaldırılıyor: gerçekte
-- teslim edilmemiş bir şey geçmişte durmasın.

create table if not exists public.teslim_gecmisi (
  id uuid primary key default gen_random_uuid(),
  -- Bilerek yabancı anahtar yok: sipariş silinse de satır kalsın.
  siparis_id uuid not null,
  musteri_id uuid references public.musteriler(id) on delete set null,
  adres_id uuid references public.adresler(id) on delete set null,
  kurye_id uuid,
  musteri_ad text,
  telefon text,
  adres jsonb,
  kaynak text,
  abonelik_id uuid,
  tutar numeric,
  odeme_yontemi text,
  odeme_alindi boolean,
  odeme_tutari numeric,
  odeme_yapan text,
  planlanan_tarih date,
  teslim_zamani timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists teslim_gecmisi_musteri_idx
  on public.teslim_gecmisi (musteri_id, teslim_zamani desc);
create index if not exists teslim_gecmisi_siparis_idx
  on public.teslim_gecmisi (siparis_id);

alter table public.teslim_gecmisi enable row level security;

drop policy if exists "personel okur" on public.teslim_gecmisi;
create policy "personel okur" on public.teslim_gecmisi
  for select using (personel_mi() or sahip_mi());
-- Ekleme/güncelleme/silme politikası yok: yalnızca tetikleyici yazar.

create or replace function public.teslim_gecmisi_yaz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.musteriler%rowtype;
  a public.adresler%rowtype;
begin
  -- Teslim geri alındı: bu teslimin kaydını kaldır.
  if tg_op = 'UPDATE' and old.durum = 'teslim' and new.durum is distinct from 'teslim' then
    delete from public.teslim_gecmisi
     where id = (
       select id from public.teslim_gecmisi
        where siparis_id = old.id
        order by teslim_zamani desc
        limit 1
     );
    return new;
  end if;

  if new.durum = 'teslim'
     and (tg_op = 'INSERT' or old.durum is distinct from 'teslim') then
    select * into m from public.musteriler where id = new.musteri_id;
    select * into a from public.adresler where id = new.adres_id;
    insert into public.teslim_gecmisi (
      siparis_id, musteri_id, adres_id, kurye_id, musteri_ad, telefon, adres,
      kaynak, abonelik_id, tutar, odeme_yontemi, odeme_alindi, odeme_tutari,
      odeme_yapan, planlanan_tarih, teslim_zamani
    ) values (
      new.id, new.musteri_id, new.adres_id, new.kurye_id, m.ad, m.telefon,
      case when a.id is null then null else to_jsonb(a) end,
      new.kaynak, new.abonelik_id, new.tutar, new.odeme_yontemi,
      new.odeme_alindi, new.odeme_tutari, new.odeme_yapan, new.planlanan_tarih,
      coalesce(new.teslim_zamani, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists siparis_teslim_gecmisi on public.siparisler;
create trigger siparis_teslim_gecmisi
  after insert or update of durum on public.siparisler
  for each row execute function public.teslim_gecmisi_yaz();

-- Şimdiye kadar teslim edilmiş siparişler de geçmişe girsin.
insert into public.teslim_gecmisi (
  siparis_id, musteri_id, adres_id, kurye_id, musteri_ad, telefon, adres,
  kaynak, abonelik_id, tutar, odeme_yontemi, odeme_alindi, odeme_tutari,
  odeme_yapan, planlanan_tarih, teslim_zamani
)
select s.id, s.musteri_id, s.adres_id, s.kurye_id, m.ad, m.telefon,
       case when a.id is null then null else to_jsonb(a) end,
       s.kaynak, s.abonelik_id, s.tutar, s.odeme_yontemi, s.odeme_alindi,
       s.odeme_tutari, s.odeme_yapan, s.planlanan_tarih,
       coalesce(s.teslim_zamani, s.created_at)
  from public.siparisler s
  left join public.musteriler m on m.id = s.musteri_id
  left join public.adresler a on a.id = s.adres_id
 where s.durum = 'teslim'
   and not exists (select 1 from public.teslim_gecmisi g where g.siparis_id = s.id);
