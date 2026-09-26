import barkUrl from '../assets/audio/puppy-bark.mp3?url';

/** A real CC0 dog bark, bundled locally; the smaller impact/lick cues remain procedural. */
let audio: AudioContext | null = null;
let installed = false;
let barkBuffer: AudioBuffer | null = null;
let barkLoading: Promise<AudioBuffer | null> | null = null;

function loadBark(ctx: AudioContext) {
  return barkLoading ??= fetch(barkUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Bark audio: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then(bytes => ctx.decodeAudioData(bytes))
    .then(buffer => barkBuffer = buffer)
    .catch(error => { barkLoading = null; console.warn('Could not load puppy bark', error); return null; });
}

function playBark(ctx: AudioContext, buffer: AudioBuffer) {
  if (ctx.state !== 'running') return;
  const voice = ctx.createBufferSource(), gain = ctx.createGain();
  voice.buffer = buffer;
  // Keep the recorded vocal character; small variations avoid an identical repeated sound.
  voice.playbackRate.value = 0.94 + Math.random() * 0.1;
  gain.gain.value = 0.55 + Math.random() * 0.07;
  voice.connect(gain); gain.connect(ctx.destination); voice.start();
  voice.onended = () => { voice.disconnect(); gain.disconnect(); };
}

export function preparePuppyAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const unlock = () => {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    void loadBark(audio);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function puppySound(kind: 'bark' | 'land' | 'lick') {
  const ctx = audio; if (!ctx || ctx.state !== 'running') return;
  if (kind === 'bark') {
    if (barkBuffer) playBark(ctx, barkBuffer);
    else void loadBark(ctx).then(buffer => { if (buffer) playBark(ctx, buffer); });
    return;
  }
  const now = ctx.currentTime;
  const duration = kind === 'land' ? 0.18 : 0.13;
  const gain = ctx.createGain(); gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.065, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  const voice = ctx.createOscillator(); voice.type = kind === 'lick' ? 'sine' : 'sawtooth';
  voice.frequency.setValueAtTime(kind === 'land' ? 75 : 430, now);
  voice.frequency.exponentialRampToValueAtTime(kind === 'land' ? 30 : 190, now + duration);
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450;
  voice.connect(filter); filter.connect(gain); voice.start(now); voice.stop(now + duration);
  voice.onended = () => { voice.disconnect(); filter.disconnect(); gain.disconnect(); };
}
