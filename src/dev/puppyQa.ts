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
    info.textContent = JSON.stringify({ phase: l.phase, move: l.move, moveTime: Number(l.moveTime.toFixed(2)), mode: ctx.player.mode, pos: ctx.player.pos.map(n => +n.toFixed(2)), flight: l.flight, perfect: l.perfectLaunch, status: l.status, gettingUp: ctx.player.gettingUp, immunity: l.immunity, pitCamera: !!l.pitCamera }, null, 0);
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
  button('Lick wind-up', () => { battle(); (level() as any).setMove('lick'); step(0.9); });
  button('Timed jump', () => { const l = level() as any; if (l.move !== 'lick') return; step(Math.max(0, 1.10 - l.moveTime)); key('Space', true); step(0.25); key('Space', false); });
  button('Apex', () => step(0.85));
  button('Land / recover', () => step(6));
  button('Look up', () => { ctx.camera.pitch = 0.95; step(0.35); });
  button('Paw', () => { battle(); (level() as any).beginAttack('paw'); step(0.7); });
  button('Paw reach', () => { battle(); ctx.player.reset([0, 0, 2.6]); (level() as any).beginAttack('paw'); step(0.7); });
  button('Bark', () => { (level() as any).bark(); step(0.12); });
  button('Tail', () => { battle(); ctx.player.reset([1.2, 0, -6]); step(0.8); });
  button('Rear pit', () => {
    battle(); const l = level() as any; l.setMove('recover'); l.recoverTime = 30; step(2);
    ctx.player.reset([4.5, 0, -4.8]); ctx.camera.reset(0); step(0.1);
  });
  button('Puppy man', () => {
    reset(); ctx.player.reset([12.35, 0, -12.35]); step(0.15);
    ctx.player.emerge([0, 0.95, 3], 0, [0, 0, 0], 0); ctx.player.gettingUp = false; ctx.player.body!.muscle = 1;
    ctx.camera.reset(Math.PI); ctx.camera.pitch = -0.12; step(0.3); ctx.hud.hide();
  });
  button('Secret platform', () => {
    reset(); ctx.player.reset([12.35, 0, -11.1]); ctx.camera.reset(); ctx.camera.pitch = -0.4; step(0.25);
  });
  button('Underside', () => {
    battle(); const l = level() as any; l.hoopTime = 1.8; l.setMove('recover'); l.recoverTime = 30;
    ctx.player.pos = [5.6, 16.2, 2.8]; ctx.player.mode = 'flying'; ctx.player.flightDir = [0, 1, 0];
    l.flight = [0, 10, 0]; l.highFlight = true; step(0.1);
  });
  button('Pounce', () => { battle(); (level() as any).beginAttack('pounce'); step(0.4); });
  button('Pit', () => { battle(); ctx.player.reset([-12.5, 0.05, 3]); step(0.7); });
  button('Catch pit edge', () => {
    battle(); const l = level() as any; l.setMove('recover'); l.recoverTime = 30;
    ctx.player.reset([-11.45, 0, 3]); l.launch([6, -1, 0], false); ctx.player.pos[1] = 0.72; step(0.025);
  });
  button('Rim', () => {
    battle(); const l = level() as any; l.setMove('recover'); l.recoverTime = 30;
    l.hoopTime = 1.8; step(0.02);
    ctx.player.pos = [7.6, 18.7, 2.8]; ctx.player.mode = 'flying'; ctx.player.flightStyle = 'flail'; ctx.player.flightDir = [0, 1, 0];
    l.flight = [0, -6, 0]; l.highFlight = true; l.flightYaw = 0; l.flightViewBlend = 1; step(0.15);
  });
  button('+0.1s', () => step(0.1)); button('+0.5s', () => step(0.5)); button('+1s', () => step(1));
  button('Hide controls', () => { panel.style.display = 'none'; });
  panel.append(info); document.body.append(panel);
  // Keep logs visible in diagnostics and fail loudly on rendering validation errors.
  window.addEventListener('error', e => { info.textContent = `ERROR: ${e.message}`; });
  reset(); report();
}
