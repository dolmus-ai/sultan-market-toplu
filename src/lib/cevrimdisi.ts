import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Çevrimdışı kuyruk — apartman girişinde, bodrumda, asansörde sinyal gider.
 * Kuryenin yaptığı işlem önce IndexedDB'ye yazılır, sinyal gelince sırayla
 * gönderilir. Böylece "Teslim ettim" dokunuşu hiçbir koşulda kaybolmaz.
 */

const VERITABANI = "sultan-kurye";
const DEPO = "islemler";

/** Kuyruğa yazılacak işlem — kimlik/zaman kuyruk tarafından eklenir. */
export type YeniIslem =
  | {
      tur: "siparis-guncelle";
      veri: { siparisId: string; yama: Record<string, unknown> };
    }
  | {
      tur: "tahsilat-ekle";
      veri: {
        siparis_id: string;
        kurye_id: string;
        vardiya_id: string | null;
        tutar: number;
        yontem: string;
      };
    }
  | {
      tur: "adres-guncelle";
      veri: { adresId: string; yama: Record<string, unknown> };
    };

export type BekleyenIslem = YeniIslem & { id: string; zaman: number };

function acilis(): Promise<IDBDatabase> {
  return new Promise((coz, hata) => {
    const istek = indexedDB.open(VERITABANI, 1);
    istek.onupgradeneeded = () => {
      const db = istek.result;
      if (!db.objectStoreNames.contains(DEPO)) {
        db.createObjectStore(DEPO, { keyPath: "id" });
      }
    };
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => hata(istek.error);
  });
}

function islem<T>(
  mod: IDBTransactionMode,
  is: (depo: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return acilis().then(
    (db) =>
      new Promise<T>((coz, hata) => {
        const t = db.transaction(DEPO, mod);
        const istek = is(t.objectStore(DEPO));
        istek.onsuccess = () => coz(istek.result);
        istek.onerror = () => hata(istek.error);
      }),
  );
}

export async function kuyrugaEkle(girdi: YeniIslem): Promise<void> {
  const kayit: BekleyenIslem = {
    ...girdi,
    id: crypto.randomUUID(),
    zaman: Date.now(),
  };
  await islem("readwrite", (d) => d.add(kayit));
}

export async function bekleyenler(): Promise<BekleyenIslem[]> {
  try {
    const hepsi = await islem<BekleyenIslem[]>("readonly", (d) => d.getAll());
    return hepsi.sort((a, b) => a.zaman - b.zaman);
  } catch {
    return [];
  }
}

async function sil(id: string) {
  await islem("readwrite", (d) => d.delete(id));
}

/** Tek bir bekleyen işlemi sunucuya uygular. */
export async function islemiGonder(
  db: SupabaseClient,
  is: YeniIslem,
): Promise<void> {
  if (is.tur === "siparis-guncelle") {
    const { error } = await db
      .from("siparisler")
      .update(is.veri.yama)
      .eq("id", is.veri.siparisId);
    if (error) throw error;
    return;
  }
  if (is.tur === "tahsilat-ekle") {
    const { error } = await db.from("tahsilatlar").insert(is.veri);
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("adresler")
    .update(is.veri.yama)
    .eq("id", is.veri.adresId);
  if (error) throw error;
}

/**
 * Önce doğrudan göndermeyi dener; ağ yoksa ya da istek düşerse kuyruğa
 * yazar. `true` = sunucuya ulaştı, `false` = kuyrukta bekliyor.
 */
export async function kuyrukVeyaGonder(
  db: SupabaseClient,
  girdi: YeniIslem,
): Promise<boolean> {
  const cevrimici = typeof navigator === "undefined" || navigator.onLine;
  if (cevrimici) {
    try {
      await islemiGonder(db, girdi);
      return true;
    } catch {
      /* kuyruğa düş */
    }
  }
  await kuyrugaEkle(girdi);
  return false;
}

/**
 * Kuyruğu sırayla boşaltır. İlk hatada durur — sıra bozulmasın diye.
 * Geriye kalan işlem sayısını döndürür.
 */
export async function kuyruguIsle(db: SupabaseClient): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return (await bekleyenler()).length;
  }

  const sira = await bekleyenler();
  for (const is of sira) {
    try {
      await islemiGonder(db, is);
      await sil(is.id);
    } catch {
      break;
    }
  }
  return (await bekleyenler()).length;
}
