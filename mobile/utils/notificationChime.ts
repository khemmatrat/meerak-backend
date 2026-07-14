/**
 * Soft double-tone chime for in-app polling notifications (does not rely on MP3 asset).
 */

export function playNotificationChime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const playTone = (
      ctx: AudioContext,
      startAt: number,
      freq: number,
      dur: number
    ): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.085, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);
    };

    const ctx = new Ctx();
    const t0 = ctx.currentTime + 0.02;
    playTone(ctx, t0, 1046.5, 0.09);
    playTone(ctx, t0 + 0.11, 1318.5, 0.1);
    ctx.resume?.().catch(() => {});
    window.setTimeout(() => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }, 800);
  } catch {
    /* ignore — environments without AudioContext */
  }
}
