/** Uzantısız göreli içe aktarmaları .ts'e çözer — testleri derlemeden çalıştırmak için. */
export async function resolve(belirtec, baglam, sonraki) {
  try {
    return await sonraki(belirtec, baglam);
  } catch (hata) {
    if (belirtec.startsWith(".")) {
      for (const ek of [".ts", ".tsx", "/index.ts"]) {
        try {
          return await sonraki(belirtec + ek, baglam);
        } catch {
          /* sıradakini dene */
        }
      }
    }
    throw hata;
  }
}
