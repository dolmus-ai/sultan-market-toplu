-- Teslimat kapatılırken ödeme bilgisi zorunlu: yöntem (odeme_yontemi, zaten
-- vardı), tahsil edilen tutar ve ödemeyi yapan kişi. Kasaya işlenmeyen
-- yöntemlerde (havale vb.) de tutar burada kalıyor; `tahsilatlar` yalnızca
-- kuryenin elden aldığı parayı tutuyor.
alter table public.siparisler
  add column if not exists odeme_yapan text,
  add column if not exists odeme_tutari numeric(12, 2)
    check (odeme_tutari is null or odeme_tutari >= 0);
