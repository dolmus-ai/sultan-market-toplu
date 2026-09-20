/**
 * Kurye uygulaması servis çalışanı.
 *
 * Bilinçli olarak sade: uygulama kabuğunu ve statik varlıkları önbelleğe
 * alır, veri isteklerine hiç karışmaz. Sipariş/tahsilat gibi yazma
 * işlemlerinin çevrimdışı dayanıklılığı IndexedDB kuyruğunda (lib/cevrimdisi)
 * hallediliyor; burada onları da yakalamak iki ayrı doğruluk kaynağı yaratırdı.
 */
const SURUM = "sultan-kurye-v1";
const KABUK = ["/giris", "/ikon/amblem.svg", "/manifest.webmanifest"];

self.addEventListener("install", (olay) => {
  olay.waitUntil(
    caches
      .open(SURUM)
      // `cache: "reload"` şart: kabuk tarayıcı önbelleğinden değil ağdan
      // gelsin, yoksa yeni servis çalışanı eski kabuğu kopyalıyor.
      .then((c) => c.addAll(KABUK.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil(
    caches
      .keys()
      .then((adlar) =>
        Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET") return;

  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  // Sunucu tarafı veriye ve API'ye dokunma.
  if (url.pathname.startsWith("/api/")) return;

  // Statik varlıklar: önce önbellek.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/ikon")) {
    olay.respondWith(
      caches.match(istek).then(
        (bulunan) =>
          bulunan ??
          fetch(istek).then((yanit) => {
            const kopya = yanit.clone();
            caches.open(SURUM).then((c) => c.put(istek, kopya));
            return yanit;
          }),
      ),
    );
    return;
  }

  // Sayfalar: önce ağ, düşerse önbellekten kabuk.
  if (istek.mode === "navigate") {
    olay.respondWith(
      fetch(istek)
        .then((yanit) => {
          /*
           * Çevrimdışı yedeği her başarılı açılışta tazele. Kabuk yalnızca
           * kurulumda alınsaydı bayatlardı: bu dosya değişmediği sürece
           * `install` bir daha çalışmıyor, eski kabuk da artık var olmayan
           * eski JS parçalarına işaret ediyor. Çevrimdışı açılış kırılırdı.
           */
          if (yanit.ok && url.pathname === "/giris") {
            const kopya = yanit.clone();
            caches.open(SURUM).then((c) => c.put("/giris", kopya));
          }
          return yanit;
        })
        .catch(() => caches.match("/giris").then((y) => y ?? Response.error())),
    );
  }
});
