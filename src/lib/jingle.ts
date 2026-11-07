/**
 * Açılış sesi — Web Audio ile sentezlenir, ses dosyası taşımaz.
 * Kısa, yumuşak bir üç nota + altında hafif bir vuruş.
 */

const NOTALAR = [659.25, 830.61, 987.77]; // Mi5 · Sol#5 · Si5

let baglam: AudioContext | null = null;

function sesBaglami(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Yapici =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Yapici) return null;
  baglam ??= new Yapici();
  return baglam;
}

/**
 * Açılış melodisini çalar.
 * Tarayıcı kullanıcı etkileşiminden önce sesi engelliyorsa `false` döner;
 * çağıran taraf ilk dokunuşta yeniden deneyebilir.
 */
export async function acilisSesi(): Promise<boolean> {
  const ctx = sesBaglami();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return false;
  }
  if (ctx.state !== "running") return false;

  const simdi = ctx.currentTime;
  const ana = ctx.createGain();
  ana.gain.value = 0.16;
  ana.connect(ctx.destination);

  // Zil notaları
  NOTALAR.forEach((frekans, i) => {
    const bas = simdi + i * 0.11;
    const osilator = ctx.createOscillator();
    const zarf = ctx.createGain();

    osilator.type = "sine";
    osilator.frequency.setValueAtTime(frekans, bas);

    zarf.gain.setValueAtTime(0.0001, bas);
    zarf.gain.exponentialRampToValueAtTime(1, bas + 0.02);
    zarf.gain.exponentialRampToValueAtTime(0.0001, bas + 0.85);

    osilator.connect(zarf).connect(ana);
    osilator.start(bas);
    osilator.stop(bas + 0.9);
  });

  // Altına yumuşak bir vuruş
  const vurus = ctx.createOscillator();
  const vurusZarf = ctx.createGain();
  vurus.type = "sine";
  vurus.frequency.setValueAtTime(146.83, simdi);
  vurus.frequency.exponentialRampToValueAtTime(73.42, simdi + 0.28);
  vurusZarf.gain.setValueAtTime(0.0001, simdi);
  vurusZarf.gain.exponentialRampToValueAtTime(0.7, simdi + 0.015);
  vurusZarf.gain.exponentialRampToValueAtTime(0.0001, simdi + 0.45);
  vurus.connect(vurusZarf).connect(ana);
  vurus.start(simdi);
  vurus.stop(simdi + 0.5);

  return true;
}

/** Girişte başarılı oturum için kısa bir onay tınısı. */
export async function onaySesi() {
  const ctx = sesBaglami();
  if (!ctx || ctx.state !== "running") return;

  const simdi = ctx.currentTime;
  const ana = ctx.createGain();
  ana.gain.value = 0.13;
  ana.connect(ctx.destination);

  [783.99, 1046.5].forEach((frekans, i) => {
    const bas = simdi + i * 0.09;
    const osilator = ctx.createOscillator();
    const zarf = ctx.createGain();
    osilator.type = "triangle";
    osilator.frequency.setValueAtTime(frekans, bas);
    zarf.gain.setValueAtTime(0.0001, bas);
    zarf.gain.exponentialRampToValueAtTime(1, bas + 0.015);
    zarf.gain.exponentialRampToValueAtTime(0.0001, bas + 0.4);
    osilator.connect(zarf).connect(ana);
    osilator.start(bas);
    osilator.stop(bas + 0.45);
  });
}

/**
 * Defter ↔ kurye modu geçiş sesi: süzgeçten geçen bir "vuuş" ve üstünde
 * hızlı bir arpej. Kurye moduna giderken notalar yükselir, deftere dönerken
 * iner — kulak hangi yöne gidildiğini ayırt etsin.
 *
 * Dokunuşun içinden çağrılmalı: tarayıcı sesi ancak kullanıcı etkileşimiyle
 * açıyor. Geçiş tam sayfa yüklemesi olduğu için ses çıkılan sayfada çalar.
 */
export async function gecisSesi(hedef: "kurye" | "defter"): Promise<void> {
  const ctx = sesBaglami();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return;
  }
  if (ctx.state !== "running") return;

  const simdi = ctx.currentTime;
  const ana = ctx.createGain();
  ana.gain.value = 0.15;
  ana.connect(ctx.destination);

  // Vuuş: beyaz gürültü, bant geçiren süzgeç yukarı (ya da aşağı) süpürülür.
  const sure = 0.55;
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sure), ctx.sampleRate);
  const veri = tampon.getChannelData(0);
  for (let i = 0; i < veri.length; i++) veri[i] = Math.random() * 2 - 1;
  const gurultu = ctx.createBufferSource();
  gurultu.buffer = tampon;
  const suzgec = ctx.createBiquadFilter();
  suzgec.type = "bandpass";
  suzgec.Q.value = 1.4;
  const [bas, son] = hedef === "kurye" ? [380, 3200] : [3000, 360];
  suzgec.frequency.setValueAtTime(bas, simdi);
  suzgec.frequency.exponentialRampToValueAtTime(son, simdi + sure);
  const gurultuZarf = ctx.createGain();
  gurultuZarf.gain.setValueAtTime(0.0001, simdi);
  gurultuZarf.gain.exponentialRampToValueAtTime(0.55, simdi + 0.12);
  gurultuZarf.gain.exponentialRampToValueAtTime(0.0001, simdi + sure);
  gurultu.connect(suzgec).connect(gurultuZarf).connect(ana);
  gurultu.start(simdi);
  gurultu.stop(simdi + sure);

  // Arpej — vuuşun ortasından başlar.
  const notalar =
    hedef === "kurye"
      ? [523.25, 659.25, 783.99, 1046.5] // Do5 · Mi5 · Sol5 · Do6
      : [1046.5, 783.99, 659.25, 523.25];
  notalar.forEach((frekans, i) => {
    const t = simdi + 0.16 + i * 0.075;
    const osilator = ctx.createOscillator();
    const zarf = ctx.createGain();
    osilator.type = i === notalar.length - 1 ? "sine" : "triangle";
    osilator.frequency.setValueAtTime(frekans, t);
    zarf.gain.setValueAtTime(0.0001, t);
    zarf.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
    zarf.gain.exponentialRampToValueAtTime(
      0.0001,
      t + (i === notalar.length - 1 ? 0.7 : 0.3),
    );
    osilator.connect(zarf).connect(ana);
    osilator.start(t);
    osilator.stop(t + 0.75);
  });
}

/**
 * Tam ekran liste açılıp kapanırken kısa bir "vuuş".
 *
 * Süzgeçten geçirilmiş gürültü: açılırken tiz tarafa, kapanırken pes tarafa
 * kayıyor; altında hafif bir tık. Kısa ve kısık — sahada rahatsız etmesin.
 */
export async function kaydirmaSesi(acilis: boolean) {
  const ctx = sesBaglami();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    return;
  }
  if (ctx.state !== "running") return;

  const simdi = ctx.currentTime;
  const sure = 0.24;

  // Beyaz gürültü tamponu
  const ornek = Math.floor(ctx.sampleRate * sure);
  const tampon = ctx.createBuffer(1, ornek, ctx.sampleRate);
  const veri = tampon.getChannelData(0);
  for (let i = 0; i < ornek; i++) veri[i] = Math.random() * 2 - 1;
  const gurultu = ctx.createBufferSource();
  gurultu.buffer = tampon;

  const suzgec = ctx.createBiquadFilter();
  suzgec.type = "bandpass";
  suzgec.Q.value = 1.4;
  suzgec.frequency.setValueAtTime(acilis ? 500 : 2600, simdi);
  suzgec.frequency.exponentialRampToValueAtTime(acilis ? 2600 : 450, simdi + sure);

  const zarf = ctx.createGain();
  zarf.gain.setValueAtTime(0.0001, simdi);
  zarf.gain.exponentialRampToValueAtTime(0.22, simdi + 0.05);
  zarf.gain.exponentialRampToValueAtTime(0.0001, simdi + sure);

  gurultu.connect(suzgec).connect(zarf).connect(ctx.destination);
  gurultu.start(simdi);
  gurultu.stop(simdi + sure);

  // Sonunda yumuşak tık
  const tik = ctx.createOscillator();
  const tikZarf = ctx.createGain();
  const tikBas = simdi + sure - 0.04;
  tik.type = "sine";
  tik.frequency.setValueAtTime(acilis ? 880 : 520, tikBas);
  tikZarf.gain.setValueAtTime(0.0001, tikBas);
  tikZarf.gain.exponentialRampToValueAtTime(0.08, tikBas + 0.01);
  tikZarf.gain.exponentialRampToValueAtTime(0.0001, tikBas + 0.12);
  tik.connect(tikZarf).connect(ctx.destination);
  tik.start(tikBas);
  tik.stop(tikBas + 0.14);
}
