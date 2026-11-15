/**
 * Kurye uygulaması servis çalışanı.
 *
 * Bilinçli olarak sade: uygulama kabuğunu ve statik varlıkları önbelleğe
 * alır, veri isteklerine hiç karışmaz. Sipariş/tahsilat gibi yazma
 * işlemlerinin çevrimdışı dayanıklılığı IndexedDB kuyruğunda (lib/cevrimdisi)
 * hallediliyor; burada onları da yakalamak iki ayrı doğruluk kaynağı yaratırdı.
 *
 * Yönlendirmeler: uygulamanın her girişi yönlendiriyor (`/` → `/giris`,
 * oturumsuz `/harita` → `/giris`, oturumlu `/giris` → `/harita`). Safari,
 * servis çalışanının sayfa açılışına yönlendirme izlemiş (`redirected`) bir
 * yanıt dönmesini kabul etmiyor: "Response served by service worker has
 * redirections" deyip sayfayı hiç açmıyor. Bu yüzden böyle bir yanıt asla
 * olduğu gibi dönülmüyor ve asla önbelleğe yazılmıyor.
 */
const SURUM = "sultan-kurye-v4";
const KABUK = ["/giris", "/ikon/amblem.svg", "/manifest.webmanifest"];

/** Önbelleğe yazılmaya uygun mu: sağlam, aynı köken, yönlendirmesiz. */
function saklanir(yanit) {
  return yanit && yanit.ok && yanit.type === "basic" && !yanit.redirected;
}

/**
 * Yanıtı yönlendirme izi taşımayan temiz bir kopyaya çevirir. Eski
 * sürümlerin önbelleğinde kalmış kirli kayıtlar için son güvence.
 */
async function temizle(yanit) {
  if (!yanit || !yanit.redirected) return yanit;
  const govde = await yanit.blob();
  return new Response(govde, {
    status: yanit.status,
    statusText: yanit.statusText,
    headers: yanit.headers,
  });
}

self.addEventListener("install", (olay) => {
  olay.waitUntil(
    caches
      .open(SURUM)
      .then((c) =>
        Promise.all(
          KABUK.map((u) =>
            // `cache: "reload"`: kabuk tarayıcı önbelleğinden değil ağdan
            // gelsin. `addAll` kullanılmıyor: oturum açıkken `/giris`
            // `/harita`ya yönleniyor, o yönlendirilmiş yanıt saklanırsa
            // Safari'de açılış kırılıyordu. Tek kaydın düşmesi de kurulumu
            // düşürmesin.
            fetch(new Request(u, { cache: "reload" }))
              .then((y) => (saklanir(y) ? c.put(u, y) : undefined))
              .catch(() => {}),
          ),
        ),
      )
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
  // Sunucu tarafı veriye, API'ye ve Supabase geçidine dokunma.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/sb/")) return;

  // Statik varlıklar: önce önbellek.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/ikon")) {
    olay.respondWith(
      caches.match(istek).then(
        (bulunan) =>
          bulunan ??
          fetch(istek).then((yanit) => {
            /*
             * Yalnızca sağlam yanıt saklanır. Önceden 404/500 ya da mobil
             * operatörün araya soktuğu hata sayfası da saklanıyordu; dosya
             * adı değişmediği için o bozuk kopya sonsuza dek sunuluyor,
             * uygulama o tarayıcıda bir daha açılmıyordu.
             */
            if (saklanir(yanit)) {
              const kopya = yanit.clone();
              caches.open(SURUM).then((c) => c.put(istek, kopya)).catch(() => {});
            }
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
           * Ağ yönlendirmeyi kendisi izlediyse (bazı Safari sürümleri sayfa
           * isteğinde bunu yapıyor) içeriği dönmek yerine tarayıcıya son
           * adrese gitmesini söylüyoruz: adres çubuğu da doğru adresi
           * gösteriyor, Safari de hata vermiyor.
           */
          if (yanit.redirected) return Response.redirect(yanit.url, 302);
          /*
           * Çevrimdışı yedeği her başarılı açılışta tazele. Kabuk yalnızca
           * kurulumda alınsaydı bayatlardı: bu dosya değişmediği sürece
           * `install` bir daha çalışmıyor, eski kabuk da artık var olmayan
           * eski JS parçalarına işaret ediyor. Çevrimdışı açılış kırılırdı.
           */
          if (url.pathname === "/giris" && saklanir(yanit)) {
            const kopya = yanit.clone();
            caches.open(SURUM).then((c) => c.put("/giris", kopya)).catch(() => {});
          }
          return yanit;
        })
        .catch(() =>
          caches
            .match("/giris")
            .then((y) => (y ? temizle(y) : Response.error())),
        ),
    );
  }
});
