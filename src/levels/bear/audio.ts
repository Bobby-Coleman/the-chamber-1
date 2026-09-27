const clips = import.meta.glob('../../assets/audio/bear/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const LINES = {
  yep: 'Yep. Just a man.', weather: 'Weather is pretty normal in here.',
  standing: 'I mostly stand here. Sometimes I stand over there.', paperwork: 'They said there would be paperwork.',
  howdy: 'Howdy, partner.', leaving: 'Leaving so soon?',
  tiny: 'Oh, you wanna leave? Okay, go right ahead.', welcome: 'There you go. You are welcome.',
};
/** Bundled spoken dialogue works offline and does not depend on browser voice availability. */
export class BearAudio {
  private voice: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  say(key: keyof typeof LINES, tiny = false) {
    this.stop();
    if (typeof Audio === 'undefined') return;
    const voice = this.voice = new Audio(clips[`../../assets/audio/bear/${key}.wav`]);
    voice.volume = 0.85;
    voice.preservesPitch = !tiny;
    voice.playbackRate = tiny ? 1.65 : 1;
    void voice.play().catch(() => {});
  }
  effect(kind: 'roar' | 'shot' | 'step' | 'hit') {
    if (typeof AudioContext === 'undefined') return;
    const ctx = this.ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    const duration = kind === 'roar' ? 1.15 : kind === 'shot' ? 0.3 : 0.12;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (duration * 0.3)) * (kind === 'roar' ? 0.6 + 0.4 * Math.sin(t * 95) : 1);
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = kind === 'shot' ? 2600 : kind === 'roar' ? 420 : 160;
    gain.gain.value = kind === 'step' ? 0.17 : 0.55;
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  stop() { this.voice?.pause(); this.voice = null; }
  dispose() { this.stop(); void this.ctx?.close().catch(() => {}); this.ctx = null; }
}
