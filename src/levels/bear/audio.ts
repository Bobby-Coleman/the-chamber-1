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
  private wildlife:HTMLAudioElement|null=null;
  say(key: keyof typeof LINES, tiny = false) {
    this.stop();
    if (typeof Audio === 'undefined') return;
    const voice = this.voice = new Audio(clips[`../../assets/audio/bear/${key}.wav`]);
    voice.volume = 0.85;
    voice.preservesPitch = !tiny;
    voice.playbackRate = tiny ? 1.65 : 1;
    void voice.play().catch(() => {});
  }
  effect(kind: 'roar' | 'growl' | 'shot' | 'step' | 'hit') {
    if(kind==='roar'||kind==='growl') {
      if(typeof Audio==='undefined')return;
      this.wildlife?.pause();
      const recording=this.wildlife=new Audio(clips[`../../assets/audio/bear/recorded-${kind}.wav`]);
      recording.volume=kind==='roar'?0.85:0.48;
      void recording.play().catch(()=>{});
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ctx = this.ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    const duration = kind === 'shot' ? 0.3 : 0.12;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (duration * 0.3));
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = kind === 'shot' ? 2600 : 160;
    gain.gain.value = kind === 'step' ? 0.17 : 0.55;
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  stop() { this.voice?.pause(); this.voice = null; }
  dispose() { this.stop();this.wildlife?.pause();this.wildlife=null; void this.ctx?.close().catch(() => {}); this.ctx = null; }
}
