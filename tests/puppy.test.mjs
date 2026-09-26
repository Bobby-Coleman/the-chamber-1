import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Use Vite's real loader so physics and gameplay run against the same modules as the browser.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let count = 0;
const check = (name, run) => { run(); count++; console.log(`PASS ${name}`); };
try {
  const { initPhysics, Physics } = await server.ssrLoadModule('/src/engine/physics.ts');
  const { Player } = await server.ssrLoadModule('/src/game/player.ts');
  const { addChamberColliders } = await server.ssrLoadModule('/src/game/chamber.ts');
  const { PuppyLevel } = await server.ssrLoadModule('/src/levels/puppy/puppyLevel.ts');
  const rules = await server.ssrLoadModule('/src/levels/puppy/mechanics.ts');
  await initPhysics();
  const worlds = [];
  const fixture = ({ safeFloor = false } = {}) => {
    const physics = new Physics(); worlds.push(physics);
    const player = new Player(); player.attach(physics);
    const down = new Set(), pressed = new Set();
    const input = { isDown: c => down.has(c), wasPressed: c => pressed.has(c) };
    const camera = { yaw: 0, pitch: -0.2, addShake() {} };
    const hud = { setLevel() {}, hint() {}, show() {}, hide() {}, tips() {} };
    const ctx = { physics, player, input, camera, hud };
    const level = new PuppyLevel(ctx);
    addChamberColliders(physics, level.chamber);
    // Isolate ragdoll recovery from valid deaths when a moving rim throws the body into a pit.
    if (safeFloor) physics.addStaticBox([0, -0.5, 0], [28, 1, 28]);
    const step = seconds => {
      for (let t = 0; t < seconds - 1e-7; t += 1 / 120) {
        const dt = 1 / 120;
        if (player.mode === 'control' && !player.inPortal) player.update(dt, input, camera.yaw, level.obstacles(), camera.pitch);
        player.syncCollider(); level.update(dt); player.tickPortal(dt); physics.step(dt); player.afterPhysics(); pressed.clear();
      }
    };
    step(6); player.reset([0, 0, 0.4]);
    const battle = () => { level.phase = 'play'; level.vault.update(1); level.puppy.pos = [0, 0, -3.4]; level.puppy.yaw = 0; level.setMove('chase'); };
    return { ...ctx, level, down, pressed, step, battle };
  };
  check('centered late jump gets full launch; early and edge hits do not', () => {
    assert.equal(rules.lickVelocity(0, [0, 0, 1], 0.18).perfect, true);
    assert.equal(rules.lickVelocity(0, [0, 0, 1], 0.4).perfect, false);
    assert.equal(rules.lickVelocity(1, [0, 0, 1], 0.18).perfect, false);
    assert.ok(rules.lickVelocity(-1, [0, 0, 1], 1).velocity[0] < 0);
    assert.ok(rules.lickVelocity(1, [0, 0, 1], 1).velocity[0] > 0);
  });
  check('hoop accepts downward passage and rejects upward, outside, or wrong depth', () => {
    const high = rules.HOOP_Y + 1, low = rules.HOOP_Y - 1;
    assert.equal(rules.hoopCrossing([0, high, rules.HOOP_Z], [0, low, rules.HOOP_Z], 0, 0), true);
    assert.equal(rules.hoopCrossing([0, low, rules.HOOP_Z], [0, high, rules.HOOP_Z], 0, 0), false);
    assert.equal(rules.hoopCrossing([3, high, rules.HOOP_Z], [3, low, rules.HOOP_Z], 0, 0), false);
    assert.equal(rules.hoopCrossing([0, high, 0], [0, low, 0], 0, 0), false);
  });
  check('swept scoring uses the hoop position at the exact crossing time', () => {
    const t = 0.73, dt = 0.05, x = rules.hoopX(t + dt * 0.5);
    assert.equal(rules.hoopCrossing([x, rules.HOOP_Y + 1, rules.HOOP_Z], [x, rules.HOOP_Y - 1, rules.HOOP_Z], t, t + dt), true);
  });
  check('real chamber collider has open pits and a solid safe floor', () => {
    const f = fixture(); f.physics.step(0.02);
    for (const pit of rules.PITS) assert.equal(f.physics.raycast([pit.x, 1, pit.z], [0, -1, 0], 5), null);
    assert.ok(f.physics.raycast([4, 1, 5], [0, -1, 0], 2));
  });
  check('button is one-shot and reveal reaches active encounter', () => {
    const f = fixture(); f.level.release(); assert.equal(f.level.phase, 'opening');
    f.step(2); f.level.release(); assert.ok(f.level.phaseTime >= 1.9);
    f.step(6.4); assert.equal(f.level.phase, 'play'); assert.equal(f.level.vault.open, 1);
  });
  check('actual centered jump during lick launches high enough for the hoop', () => {
    const f = fixture(); f.battle(); f.level.setMove('lick'); f.step(1.1);
    f.pressed.add('Space'); f.down.add('Space'); f.step(0.23); f.down.clear();
    assert.equal(f.player.mode, 'flying'); assert.equal(f.level.perfectLaunch, true);
    f.step(0.8); assert.ok(f.player.pos[1] > rules.HOOP_Y, `apex ${f.player.pos[1]}`);
  });
  check('miss lands alive and gets a recovery window', () => {
    const f = fixture(); f.battle(); f.level.launch([0, 28, 0], true); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.step(3.35); assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.ok(f.level.immunity > 0); assert.equal(f.level.status, 'playing');
    f.step(5); assert.equal(f.player.gettingUp, false); assert.ok(f.player.pos[1] >= -0.1);
  });
  check('paws, pounce and tail have a wind-up followed by knockback', () => {
    for (const attack of ['paw', 'tail', 'pounce']) {
      const f = fixture(); f.battle();
      if (attack === 'paw') f.player.reset([0, 0, 0.4]);
      if (attack === 'tail') { f.level.puppy.pos = [0, 0, 0]; f.player.reset([1.2, 0, -3]); }
      if (attack === 'pounce') { f.player.reset([0, 0, 1]); f.level.pounceStart = [...f.level.puppy.pos]; f.level.target = [0, 0, 0]; }
      f.level.setMove(attack); f.step(0.4); assert.equal(f.level.flight, null, attack);
      f.step(attack === 'pounce' ? f.level.pounceWindup + f.level.pounceAirtime - 0.35 : 0.7); assert.ok(f.level.flight, attack);
    }
  });
  check('walking into a pit loses the attempt', () => {
    const f = fixture(); f.battle(); f.player.reset([-12.5, 0, 3]); f.step(2.5);
    assert.equal(f.level.status, 'lost'); assert.equal(f.level.phase, 'dead');
    const shot = f.level.cameraShot(); assert.ok(shot.pos[1] >= 3.2); assert.ok(shot.target[1] < 0);
    f.step(1); assert.ok(f.level.cameraShot().pos[1] >= 3.2, 'pit camera must stay above the floor');
  });
  check('catching the pit edge releases the fall camera and restores normal play', () => {
    const f = fixture(); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    f.player.reset([-11.45, 0, 3]); f.level.launch([6, -1, 0], false);
    f.player.pos[1] = 0.72;
    f.step(0.025); assert.ok(f.level.cameraShot(), 'look down while actually falling into the shaft');
    f.step(0.8);
    assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.equal(f.level.cameraShot(), null, 'a survivable edge catch must return to the normal camera');
    f.step(3); assert.equal(f.player.gettingUp, false); assert.equal(f.level.cameraShot(), null);
  });
  check('a valid airborne crossing squeezes player and exits', () => {
    const f = fixture(); f.battle(); f.level.hoopTime = 0;
    f.player.pos = [rules.hoopX(0.05), rules.HOOP_Y + 0.15, rules.HOOP_Z];
    f.player.mode = 'flying'; f.level.flight = [0, -3, 0];
    f.step(0.1); assert.equal(f.level.phase, 'escape'); assert.equal(f.player.inPortal, true);
    f.step(1.3); assert.equal(f.level.status, 'exited');
  });
  check('timing the moving machine gives a reachable win from an actual launch', () => {
    const f = fixture(); f.battle();
    const height = rules.HOOP_Y - 0.95;
    const fallAt = (28 + Math.sqrt(28 * 28 - 2 * rules.FLIGHT_GRAVITY * height)) / rules.FLIGHT_GRAVITY;
    f.level.hoopTime = 7.2 - fallAt;
    f.level.launch([0, 28, 1.6], true);
    f.step(fallAt + 0.1);
    assert.equal(f.level.phase, 'escape');
  });
  check('vault opening and walk-out never take the camera or player controls', () => {
    const f = fixture(); f.level.release();
    for (let i = 0; i < 8; i++) {
      f.step(0.9); assert.equal(f.level.cameraShot(), null); assert.equal(f.player.mode, 'control');
    }
  });
  check('close-range mix offers a lick every third attack and keeps paws and pounces', () => {
    const f = fixture(); f.battle();
    const moves = [];
    for (let i = 0; i < 9; i++) {
      f.player.reset([0, 0, 0.4]); f.level.puppy.pos = [0, 0, -3.4]; f.level.puppy.yaw = 0;
      f.level.setMove('chase');
      for (let t = 0; t < 3 && f.level.move === 'chase'; t += 0.05) f.step(0.05);
      moves.push(f.level.move);
    }
    assert.deepEqual(moves, ['pounce', 'paw', 'lick', 'paw', 'pounce', 'lick', 'pounce', 'paw', 'lick']);
    assert.equal(moves.filter(m => m === 'pounce').length, 3);
    assert.equal(moves.filter(m => m === 'lick').length, 3);
  });
  check('ascent stays close and descent becomes overhead', () => {
    const f = fixture(); f.battle(); f.level.launch([0, 28, 0], true);
    f.step(0.5);
    let shot = f.level.cameraShot();
    assert.ok(Math.hypot(shot.pos[0] - f.player.pos[0], shot.pos[2] - f.player.pos[2]) < 4);
    f.step(1.5); shot = f.level.cameraShot();
    assert.ok(shot.pos[1] - shot.target[1] > 7);
    assert.ok(Math.hypot(shot.pos[0] - shot.target[0], shot.pos[2] - shot.target[2]) < 3);
  });
  check('front paw really crosses the center, while stepping back clears the arc', () => {
    assert.ok(Math.abs(rules.pawSweepPoint(1, 0.5)[0]) < 0.01);
    const f = fixture(); f.battle(); f.player.reset([0, 0, 3.2]); f.level.setMove('paw');
    f.step(1.3); assert.equal(f.level.flight, null);
  });
  check('forward paw lunge reaches a player six metres in front on either paw', () => {
    for (const side of [-1, 1]) {
      const f = fixture(); f.battle(); f.player.reset([0, 0, 2.6]);
      f.level.puppy.pawSide = side; f.level.setMove('paw');
      f.step(0.7); assert.equal(f.level.flight, null, 'wind-up must stay safe');
      f.step(0.4); assert.ok(f.level.flight, `extended ${side} paw should connect`);
    }
  });
  check('pounce timing varies but always gives a readable bow and a fast jump', () => {
    const f = fixture(); f.battle(); const times = [];
    for (let i = 0; i < 12; i++) {
      f.level.setMove('pounce'); times.push(f.level.pounceWindup);
      assert.ok(f.level.pounceWindup >= 0.48 && f.level.pounceWindup <= 0.88);
      assert.ok(f.level.pounceAirtime >= 0.44 && f.level.pounceAirtime <= 0.54);
    }
    assert.ok(Math.max(...times) - Math.min(...times) > 0.05);
  });
  check('rim rejects a clip in either direction but leaves the opening clear', () => {
    const y = rules.HOOP_Y, z = rules.HOOP_Z;
    assert.ok(rules.rimImpact([2, y + 2, z], [2, y - 2, z], 0, 0));
    assert.ok(rules.rimImpact([2, y - 2, z], [2, y + 2, z], 0, 0));
    assert.equal(rules.rimImpact([0, y + 2, z], [0, y - 2, z], 0, 0), null);
    assert.equal(rules.rimImpact([4, y + 2, z], [4, y - 2, z], 0, 0), null);
  });
  check('rim contact creates an intact physical ragdoll and recovers from its landing', () => {
    const f = fixture({ safeFloor: true }); f.battle(); f.level.setMove('recover'); f.level.recoverTime = 30;
    // Clip the inward-facing edge. Pit deaths are verified separately above.
    f.level.hoopTime = 5.4; f.step(0.01);
    f.player.pos = [rules.hoopX(f.level.hoopTime) + 2, rules.HOOP_Y + 1.2, rules.HOOP_Z];
    f.player.mode = 'flying'; f.player.flightStyle = 'flail'; f.player.flightDir = [0, 1, 0];
    f.level.flight = [0, -6, 0]; f.level.highFlight = true;
    f.step(0.1); assert.equal(f.player.mode, 'ragdoll'); assert.equal(f.level.tumbling, true);
    assert.equal(f.player.body.brokenJoints, 0); assert.equal(f.level.flight, null);
    f.step(8);
    assert.equal(f.level.phase, 'play'); assert.equal(f.player.mode, 'control');
    assert.equal(f.player.body.brokenJoints, 0); assert.ok(f.player.pos[1] >= -0.1);
  });
  check('closed vault keeps the entire puppy behind the bars', () => {
    const f = fixture(), draws = []; f.level.puppy.draw(draws);
    // Every ellipsoid is bounded by the sum of its transformed local radii on z.
    const front = Math.max(...draws.map(d => d.model[14] + Math.abs(d.model[2]) + Math.abs(d.model[6]) + Math.abs(d.model[10])));
    assert.ok(front < -6.55, `puppy front ${front} must stay behind gate`);
  });
  for (const world of worlds) world.dispose();
  console.log(`${count} puppy checks passed`);
} finally {
  await server.close();
}
