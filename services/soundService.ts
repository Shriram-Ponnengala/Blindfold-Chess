
class SoundService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.22;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 0.5) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Bright two-note chime; a third note is added for fast answers. */
  playCorrect(fast = false) {
    if (this.isMuted) return;
    this.init();
    this.tone(784, 0, 0.18);        // G5
    this.tone(1175, 0.08, 0.26);    // D6
    if (fast) this.tone(1568, 0.16, 0.32, 'sine', 0.4); // G6
  }

  /** Rising arpeggio for streak milestones (every 5 in a row). */
  playStreak() {
    if (this.isMuted) return;
    this.init();
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.07, 0.3, 'triangle', 0.45));
  }

  playIncorrect() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime); // A2
    osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

export const soundService = new SoundService();

/** Short haptic pulses. Works on Android browsers; iOS Safari ignores it. */
export const haptics = {
  correct: () => navigator.vibrate?.(25),
  streak: () => navigator.vibrate?.([20, 40, 20, 40, 40]),
  wrong: () => navigator.vibrate?.([70, 50, 70]),
};
