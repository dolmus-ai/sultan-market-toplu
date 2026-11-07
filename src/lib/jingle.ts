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
