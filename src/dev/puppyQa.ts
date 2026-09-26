import type { LevelContext } from '../levels/level';

/** Dev-only, manual-time visual checks for browsers that throttle animation while unfocused. */
export function puppyQa(ctx: LevelContext, level: () => unknown, restart: () => void, tick: (dt: number) => void, draw: () => void) {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:1000;background:#131521e8;color:white;padding:10px;border-radius:8px;font:12px system-ui;max-width:850px';
  const info = document.createElement('div');
  info.style.cssText = 'margin-top:8px;white-space:pre-wrap';
  const step = (seconds: number) => { for (let t = 0; t < seconds - 1e-5; t += 1 / 60) tick(1 / 60); draw(); };
  const report = () => {
    const l = level() as any;
    info.textContent = JSON.stringify({ phase: l.phase, move: l.move, moveTime: Number(l.moveTime.toFixed(2)), mode: ctx.player.mode, pos: ctx.player.pos.map(n => +n.toFixed(2)), flight: l.flight, perfect: l.perfectLaunch, status: l.status, gettingUp: ctx.player.gettingUp, immunity: l.immunity }, null, 0);
  };
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const button = (name: string, fn: () => void) => {
    const b = document.createElement('button'); b.textContent = name;
    b.style.cssText = 'margin:3px;padding:5px 9px;background:#303446;color:white;border:1px solid #69677d;border-radius:4px;cursor:pointer';
    b.onclick = () => { fn(); draw(); report(); }; panel.append(b);
  };
  const reset = () => { restart(); step(6); ctx.player.reset([0, 0, 6.5]); ctx.camera.reset(); step(0.1); ctx.hud.hide(); };
  const battle = () => {
    reset();
    const l = level() as any;
    l.release(); step(8.3);
    ctx.player.reset([0, 0, 0.4]); ctx.camera.reset();
    l.puppy.pos = [0, 0, -3.4]; l.puppy.yaw = 0; l.setMove('chase'); step(0.1);
  };
  button('Vault', reset);
  button('Release', () => { (level() as any).release(); step(1); });
  button('Reveal', () => { reset(); (level() as any).release(); step(6.4); });
  button('Battle', battle);
  button('Lick wind-up', () => { battle(); (level() as any).attackIndex = 2; step(1.5); });
  button('Timed jump', () => { const l = level() as any; if (l.move !== 'lick') return; step(Math.max(0, 1.10 - l.moveTime)); key('Space', true); step(0.25); key('Space', false); });
  button('Apex', () => step(0.85));
  button('Land / recover', () => step(6));
  button('Look up', () => { ctx.camera.pitch = 0.95; step(0.35); });
  button('Paw', () => { battle(); (level() as any).attackIndex = 1; ctx.player.reset([3, 0, -1.5]); step(1.2); });
  button('Tail', () => { battle(); ctx.player.reset([1.2, 0, -6]); step(0.8); });
  button('Pounce', () => { battle(); ctx.player.reset([5, 0, 7]); step(1.8); });
  button('Pit', () => { battle(); ctx.player.reset([-8.3, 0.05, 3]); step(1.5); });
  button('+0.1s', () => step(0.1)); button('+0.5s', () => step(0.5)); button('+1s', () => step(1));
  button('Hide controls', () => { panel.style.display = 'none'; });
  panel.append(info); document.body.append(panel);
  // Keep logs visible in diagnostics and fail loudly on rendering validation errors.
  window.addEventListener('error', e => { info.textContent = `ERROR: ${e.message}`; });
  reset(); report();
}
