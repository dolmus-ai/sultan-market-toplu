-- Kullanıcı pasif/aktif durumu (çıkarılan personel pasife alınır, kayıt geçmişi korunur)
alter table public.profiles add column aktif boolean not null default true;
