import { audioContext } from './audio';

/** A short two-note chime for incoming huddles. Silently does nothing if audio is unavailable. */
export function playChime(): void {
  try {
    const ctx = audioContext();
    const now = ctx.currentTime;
    for (const [freq, at] of [
      [660, 0],
      [880, 0.18],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.2, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.4);
    }
  } catch {
    // No audio output available.
  }
}
