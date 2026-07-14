/** เสียงสำเร็จหลังชำระ — chime สั้น + ออกเสียง "อะ-คอนด์" (แบรนด์) */
export function playAqondSuccessSound(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(523.25, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close().catch(() => {}), 400);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("อะ-คอนด์");
      u.lang = "th-TH";
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}
