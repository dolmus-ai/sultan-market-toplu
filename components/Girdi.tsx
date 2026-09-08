"use client";

import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { buyukHarf, tutarFormatla } from "@/lib/format";

// Kontrollü alanda yazarken değeri dönüştürünce (büyük harf, binlik ayracı)
// React değeri DOM'a geri yazıyor ve tarayıcı imleci sona atıyordu — kelimenin
// ortasına harf eklenemiyordu. Burada imleç, yazılan karakterin hemen sağına
// geri konur.
function useImlecKoruma<T extends HTMLInputElement | HTMLTextAreaElement>(
  donustur: (ham: string, imlec: number) => [string, number],
  onValueChange: (deger: string) => void
) {
  const ref = useRef<T>(null);
  const hedefImlec = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const p = hedefImlec.current;
    hedefImlec.current = null;
    if (p !== null && el && document.activeElement === el) {
      el.setSelectionRange(p, p);
    }
  });

  const onChange = (e: ChangeEvent<T>) => {
    const ham = e.target.value;
    const [yeni, imlec] = donustur(ham, e.target.selectionStart ?? ham.length);
    hedefImlec.current = imlec;
    onValueChange(yeni);
  };

  return { ref, onChange };
}

// Türkçe büyük harf (i → İ). Harf sayısı değişmediği için imleç yerinde kalır.
const buyukHarfDonustur = (ham: string, imlec: number): [string, number] => {
  const yeni = buyukHarf(ham);
  return [yeni, imlec + (yeni.length - ham.length)];
};

// Tutar: 1.234,56 biçimi. Eklenen/çıkarılan noktalar imleci kaydırmasın diye
// imleçten önceki rakam sayısı sayılır ve yeni metinde aynı yere konur.
const tutarDonustur = (ham: string, imlec: number): [string, number] => {
  const yeni = tutarFormatla(ham);
  const rakamSayisi = ham.slice(0, imlec).replace(/[^\d,]/g, "").length;
  if (rakamSayisi === 0) return [yeni, 0];
  let sayac = 0;
  for (let i = 0; i < yeni.length; i++) {
    if (/[\d,]/.test(yeni[i])) sayac++;
    if (sayac === rakamSayisi) return [yeni, i + 1];
  }
  return [yeni, yeni.length];
};

// Alana dokununca içindeki metnin tamamını seçer: fişten okunan ad/tutar tek
// yazışta değiştirilebilsin diye. Mobil tarayıcılar odak anında imleci kendi
// koyduğu için seçim bir kare sonraya bırakılır.
const tumunuSecOdakta = <T extends HTMLInputElement | HTMLTextAreaElement>(
  e: FocusEvent<T>
) => {
  const el = e.currentTarget;
  requestAnimationFrame(() => {
    if (document.activeElement === el) el.select();
  });
};

type GirdiProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (deger: string) => void;
  // true: alana tıklayınca/dokununca içindeki metnin tamamı seçilir
  tumunuSec?: boolean;
};

type MetinAlaniProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (deger: string) => void;
};

export function BuyukHarfGirdi({
  value,
  onValueChange,
  tumunuSec,
  onFocus,
  ...rest
}: GirdiProps) {
  const { ref, onChange } = useImlecKoruma<HTMLInputElement>(
    buyukHarfDonustur,
    onValueChange
  );
  return (
    <input
      {...rest}
      ref={ref}
      value={value}
      onChange={onChange}
      onFocus={(e) => {
        if (tumunuSec) tumunuSecOdakta(e);
        onFocus?.(e);
      }}
    />
  );
}

export function TutarGirdi({
  value,
  onValueChange,
  tumunuSec,
  onFocus,
  ...rest
}: GirdiProps) {
  const { ref, onChange } = useImlecKoruma<HTMLInputElement>(
    tutarDonustur,
    onValueChange
  );
  return (
    <input
      inputMode="decimal"
      {...rest}
      ref={ref}
      value={value}
      onChange={onChange}
      onFocus={(e) => {
        if (tumunuSec) tumunuSecOdakta(e);
        onFocus?.(e);
      }}
    />
  );
}

export function BuyukHarfMetinAlani({
  value,
  onValueChange,
  ...rest
}: MetinAlaniProps) {
  const { ref, onChange } = useImlecKoruma<HTMLTextAreaElement>(
    buyukHarfDonustur,
    onValueChange
  );
  return <textarea {...rest} ref={ref} value={value} onChange={onChange} />;
}
