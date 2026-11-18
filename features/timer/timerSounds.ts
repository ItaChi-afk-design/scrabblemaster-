export class TimerSounds {
  private audioContext: AudioContext | null = null;

  unlock(onError: (message: string) => void) {
    if (typeof window.AudioContext === "undefined") {
      onError("Timer sound isn't supported by this browser.");
      return;
    }

    const context = this.audioContext ?? new AudioContext();
    this.audioContext = context;
    void context.resume().catch(() => onError("Could not enable timer sound."));
  }

  play(secondsLeft = 0, onError: (message: string) => void) {
    const context = this.audioContext;
    if (!context) return;
    if (secondsLeft > 0 && secondsLeft <= 10) return;

    const playSound = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";

      if (secondsLeft === 0) {
        oscillator.type = "sawtooth";
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.exponentialRampToValueAtTime(95, now + 1.6);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
        gain.gain.setValueAtTime(0.5, now + 1.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(now + 1.71);
        return;
      }

      const finalFive = secondsLeft <= 5;
      const finalTen = secondsLeft <= 10;
      const finalTwenty = secondsLeft <= 20;
      const frequency = finalFive
        ? 300 - secondsLeft * 15
        : finalTen
          ? 900 + (10 - secondsLeft) * 45
          : finalTwenty
            ? 650 + (20 - secondsLeft) * 25
            : 520;
      const volume = finalFive
        ? 0.27 + (5 - secondsLeft) * 0.03
        : finalTen
          ? 0.24
          : finalTwenty
            ? 0.16
            : 0.09;
      const duration = finalFive ? 0.3 : finalTen ? 0.22 : finalTwenty ? 0.18 : 0.12;
      const doubleBeep = finalTen && !finalFive;

      oscillator.type = finalFive ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      if (finalFive) oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      if (doubleBeep) {
        gain.gain.setValueAtTime(0.0001, now + duration + 0.04);
        gain.gain.exponentialRampToValueAtTime(volume, now + duration + 0.055);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.16);
      }

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(now + duration + (doubleBeep ? 0.17 : 0.01));
    };

    if (context.state === "running") playSound();
    else void context.resume().then(playSound).catch(() => onError("Could not play timer sound."));
  }

  dispose() {
    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== "closed") void context.close();
  }
}
