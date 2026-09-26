/** Short procedural barks / impacts; no asset download and nothing plays before a user gesture. */
let audio: AudioContext | null = null;
let installed = false;
export function preparePuppyAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const unlock = () => {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function puppySound(kind: 'bark' | 'land' | 'lick') {
  const ctx = audio; if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const duration = kind === 'bark' ? 0.28 : kind === 'land' ? 0.18 : 0.13;
  const gain = ctx.createGain(); gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'bark' ? 0.16 : 0.065, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  const voice = ctx.createOscillator(); voice.type = kind === 'lick' ? 'sine' : 'sawtooth';
  voice.frequency.setValueAtTime(kind === 'bark' ? 165 : kind === 'land' ? 75 : 430, now);
  voice.frequency.exponentialRampToValueAtTime(kind === 'bark' ? 65 : kind === 'land' ? 30 : 190, now + duration);
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = kind === 'bark' ? 650 : 450;
  voice.connect(filter); filter.connect(gain); voice.start(now); voice.stop(now + duration);
  voice.onended = () => { voice.disconnect(); filter.disconnect(); gain.disconnect(); };
}
